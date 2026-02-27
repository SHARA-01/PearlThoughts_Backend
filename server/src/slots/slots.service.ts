import { 
  Injectable, 
  BadRequestException, 
  NotFoundException, 
  ConflictException, 
  ForbiddenException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { addMinutes, format, parse } from 'date-fns';

@Injectable()
export class SlotsService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // 1. CREATE & READ OPERATIONS
  // ==========================================

  async create(userId: number, createSlotDto: CreateSlotDto) {
    const { startTime, endTime, dayOfWeek, date, schedulingType, maxBookings, slotDuration } = createSlotDto;

    if (startTime >= endTime) throw new BadRequestException('Start time must be before end time');
    if (!dayOfWeek && !date) throw new BadRequestException('You must provide either a dayOfWeek or a date');
    if (schedulingType === 'WAVE' && !slotDuration) throw new BadRequestException('WAVE scheduling requires a slotDuration');

    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new BadRequestException('User is not a doctor');

    // Overlap Check
    const overlappingSlot = await this.prisma.slot.findFirst({
      where: {
        doctorId: doctor.id,
        OR: [{ date: date || undefined }, { dayOfWeek: dayOfWeek || undefined }],
        AND: [{
          OR: [
            { startTime: { lte: startTime }, endTime: { gt: startTime } },
            { startTime: { lt: endTime }, endTime: { gte: endTime } },
            { startTime: { gte: startTime }, endTime: { lte: endTime } }
          ]
        }]
      }
    });

    if (overlappingSlot) throw new ConflictException(`Slot overlaps with an existing schedule`);

    // Time Chunk Generation
    const timeIntervals = [];
    if (schedulingType === 'STREAM') {
      timeIntervals.push({
        time: `${startTime}-${endTime}`, 
        maxCapacity: maxBookings,        
        currentBookings: 0,
        isBooked: false,
      });
    } else {
      let current = parse(startTime, 'HH:mm', new Date());
      const end = parse(endTime, 'HH:mm', new Date());
      const duration = slotDuration || 30; 

      while (current < end) {
        timeIntervals.push({
          time: `${format(current, 'HH:mm')}-${format(addMinutes(current, duration), 'HH:mm')}`,
          maxCapacity: maxBookings,       
          currentBookings: 0,
          isBooked: false,
        });
        current = addMinutes(current, duration);
      }
    }

    return this.prisma.slot.create({
      data: {
        doctorId: doctor.id,
        dayOfWeek,
        date,
        startTime,
        endTime,
        schedulingType: schedulingType || 'STREAM',
        maxBookings,
        slotDuration,
        times: { create: timeIntervals },
      },
      include: { times: true }
    });
  }

  async findMySlots(userId: number) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new BadRequestException('User is not a doctor');

    return this.prisma.slot.findMany({
      where: { doctorId: doctor.id },
      include: { times: true },
      orderBy: [{ date: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }]
    });
  }

  // ==========================================
  //! Update & Shrink/Expand
  // ==========================================

  async updateSlot(userId: number, slotId: number, dto: UpdateSlotDto) {
    if(dto.startTime && dto.endTime && dto.startTime >= dto.endTime) {
      throw new BadRequestException('Start time must be before end time');
    }
    if(!dto.startTime && !dto.endTime && !dto.maxBookings) {
      throw new BadRequestException('Pls provide at least one field to update');
    }
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    const slot = await this.prisma.slot.findUnique({ where: { id: slotId }, include: { times: true } });

    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.doctorId !== doctor.id) throw new ForbiddenException('Not your slot');

    const responseMetrics = { expandedChunks: 0, shrunkChunks: 0, rescuedPatients: 0, cancelledPatients: 0 };
    const newStartTime = dto.startTime || slot.startTime;
    const newEndTime = dto.endTime || slot.endTime;

    // A. Identify Shrink Victims
    let victimTimes = [];
    if (newStartTime > slot.startTime || newEndTime < slot.endTime) {
      victimTimes = slot.times.filter(t => {
        const chunkStart = t.time.split('-')[0];
        const chunkEnd = t.time.split('-')[1];
        return chunkStart < newStartTime || chunkEnd > newEndTime;
      });
    }

    const appointmentsToMove = await this.prisma.appointment.findMany({
      where: { timeId: { in: victimTimes.map(t => t.id) }, status: 'CONFIRMED' },
      include: { time: true, patient: true },
      orderBy: { date: 'asc' }
    });

    // B. Run Physics & Buffer Validations
    await this.validateBusinessRules(slot, dto, appointmentsToMove);

    return this.prisma.$transaction(async (tx) => {
      
      // 1. HANDLE EXPAND (Generate new chunks for boundaries)
      if (newStartTime < slot.startTime || newEndTime > slot.endTime) {
        const capacity = dto.maxBookings || slot.maxBookings;
        const duration = slot.slotDuration; // Cannot change duration on expand
        let newChunks = [];

        if (newStartTime < slot.startTime && slot.schedulingType === 'WAVE') {
          newChunks = newChunks.concat(this.generateTimeChunks(newStartTime, slot.startTime, duration, capacity, slotId));
        }
        if (newEndTime > slot.endTime && slot.schedulingType === 'WAVE') {
          newChunks = newChunks.concat(this.generateTimeChunks(slot.endTime, newEndTime, duration, capacity, slotId));
        }

        // If STREAM, we just update the single chunk later, no new chunks needed.
        if (newChunks.length > 0) {
          await tx.time.createMany({ data: newChunks });
          responseMetrics.expandedChunks = newChunks.length;
        }
      }

      // 2. HANDLE CAPACITY UPDATE (Applies to all surviving chunks)
      if (dto.maxBookings !== undefined && dto.maxBookings !== slot.maxBookings) {
        await tx.time.updateMany({
          where: { slotId, id: { notIn: victimTimes.map(t => t.id) } },
          data: { maxCapacity: dto.maxBookings, isBooked: false } // Re-open if expanding
        });
      }

      // 3. HANDLE SHRINK (Auto-Rescue Mission)
      if (victimTimes.length > 0) {
        for (const appt of appointmentsToMove) {
          const nextSlot = await tx.time.findFirst({
            where: {
              slot: { doctorId: doctor.id, schedulingType: slot.schedulingType },
              isBooked: false,
              currentBookings: { lt: tx.time.fields.maxCapacity },
              id: { notIn: victimTimes.map(t => t.id) }
            },
            orderBy: { id: 'asc' }
          });

          if (nextSlot) {
            await tx.time.update({ where: { id: nextSlot.id }, data: { currentBookings: { increment: 1 } } });
            await tx.appointment.update({
              where: { id: appt.id },
              data: { timeId: nextSlot.id, status: 'RESCHEDULED_AUTO', notes: 'Auto-rescued due to doctor shrink.' }
            });
            responseMetrics.rescuedPatients++;
          } else {
            await tx.appointment.update({
              where: { id: appt.id },
              data: { status: 'CANCELLED_BY_SYSTEM', timeId: null }
            });
            responseMetrics.cancelledPatients++;
          }
        }
        await tx.time.deleteMany({ where: { id: { in: victimTimes.map(t => t.id) } } });
        responseMetrics.shrunkChunks = victimTimes.length;
      }

      // 4. Update STREAM time chunk text if needed
      if (slot.schedulingType === 'STREAM' && (newStartTime !== slot.startTime || newEndTime !== slot.endTime)) {
         await tx.time.updateMany({
            where: { slotId },
            data: { time: `${newStartTime}-${newEndTime}` }
         });
      }

      // 5. Finalize Slot Record
      await tx.slot.update({
        where: { id: slotId },
        data: { 
          startTime: newStartTime, 
          endTime: newEndTime, 
          maxBookings: dto.maxBookings || slot.maxBookings
        }
      });

      return { message: 'Elastic schedule updated successfully', slotId, metrics: responseMetrics };
    });
  }

  // ==========================================
  // 3. SAFE DELETE
  // ==========================================

  async remove(userId: number, slotId: number) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    const slot = await this.prisma.slot.findUnique({ where: { id: slotId } });

    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.doctorId !== doctor.id) throw new ForbiddenException('Not your slot');

    const activeAppts = await this.prisma.appointment.count({
      where: { time: { slotId }, status: 'CONFIRMED' }
    });

    if (activeAppts > 0) {
      throw new ForbiddenException(`Cannot delete slot. You have ${activeAppts} confirmed appointments. Please shrink the schedule to trigger auto-rescue first.`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.time.deleteMany({ where: { slotId } });
      await tx.slot.delete({ where: { id: slotId } });
      return { message: 'Slot deleted successfully. History retained.' };
    });
  }

  // ==========================================
  // 4. PRIVATE HELPERS
  // ==========================================

  private generateTimeChunks(startTime: string, endTime: string, duration: number, capacity: number, slotId: number) {
    const parseTime = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };
    
    const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    let curr = parseTime(startTime);
    const end = parseTime(endTime);
    const chunks = [];

    while (curr + duration <= end) {
      chunks.push({
        slotId,
        time: `${formatTime(curr)}-${formatTime(curr + duration)}`,
        maxCapacity: capacity,
        currentBookings: 0,
        isBooked: false,
      });
      curr += duration;
    }
    return chunks;
  }

  private async validateBusinessRules(slot: any, updateDto: any, victimAppts: any[]) {
    if (slot.schedulingType === 'WAVE') {
      const duration = updateDto.slotDuration || slot.slotDuration;
      const capacity = updateDto.maxBookings || slot.maxBookings;
      
      if (duration < 10) throw new BadRequestException('Minimum slot duration is 10 minutes.');
      
      const minsPerPatient = duration / capacity;
      if (minsPerPatient < 10) {
        throw new BadRequestException(`For Each patient, you must have at least 10 minutes of time. Reduce max capacity or increase duration.`);
      }
    }

    if (updateDto.slotDuration && updateDto.slotDuration !== slot.slotDuration) {
      const activeCount = await this.prisma.appointment.count({
        where: { time: { slotId: slot.id }, status: 'CONFIRMED' }
      });
      if (activeCount > 0) throw new ForbiddenException('Cannot change slot duration while active appointments exist.');
    }

    if (victimAppts.length > 0) {
      const now = new Date();
      for (const appt of victimAppts) {
        const [hh, mm] = appt.time.time.split('-')[0].split(':').map(Number);
        const apptDate = new Date(appt.date);
        apptDate.setHours(hh, mm, 0, 0);

        const diffMs = apptDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 1 && diffHours > 0) {
          throw new BadRequestException(`Cannot shrink: Patient ${appt.patient.name} has an appointment in less than 1 hour.`);
        }
      }
    }
  }
}