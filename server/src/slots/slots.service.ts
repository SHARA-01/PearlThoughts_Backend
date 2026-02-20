import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { addMinutes, format, parse } from 'date-fns';

@Injectable()
export class SlotsService {
  constructor(private prisma: PrismaService) {}

 
  async create(userId: number, createSlotDto: CreateSlotDto) {
    const { startTime, endTime, dayOfWeek } = createSlotDto;

    //validate time format if user enters time in past or invalid time format
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new BadRequestException('User is not a doctor');

    //check for overlapping slots
    const overlappingSlot = await this.prisma.slot.findFirst({
      where: {
        doctorId: doctor.id,
        dayOfWeek: dayOfWeek,
        OR: [
          { startTime: { lte: startTime }, endTime: { gt: startTime } },
          { startTime: { lt: endTime }, endTime: { gte: endTime } },    
          { startTime: { gte: startTime }, endTime: { lte: endTime } }  
        ],
      },
    });

    if (overlappingSlot) {
      throw new ConflictException(`Slot overlaps with an existing time on ${dayOfWeek}`);
    }
const timeIntervals = [];
    let current = parse(startTime, 'HH:mm', new Date());
    const end = parse(endTime, 'HH:mm', new Date());

    while (current < end) {
      timeIntervals.push({
        time: format(current, 'HH:mm'), 
        isBooked: false,
      });
      current = addMinutes(current, 20); //! 20 mins interval between appointments
    }

    return this.prisma.slot.create({
      data: {
        doctorId: doctor.id,
        dayOfWeek,
        startTime,
        endTime,
        times: {
          create: timeIntervals, 
        },
      },
      include: { times: true } 
    });
  }



  // 2. GET Doctor slots (in Sorted order)
  async findMySlots(userId: number) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new BadRequestException('User is not a doctor');

    return this.prisma.slot.findMany({
      where: { doctorId: doctor.id },
      include: { times: true }, 
      orderBy: [
        { dayOfWeek: 'asc' }, 
        { startTime: 'asc' }
      ]
    });
  }

  async toggleTimeBooking(timeId: number, isBooked: boolean) {
    return this.prisma.time.update({
      where: { id: timeId },
      data: { isBooked }
    });
  }
  // update slot limit (maxBookings) for a specific slot
   async updateSlotLimit(userId: number, slotId: number, updateSlotDto: UpdateSlotDto) {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      
      const slot = await this.prisma.slot.findFirst({
        where: { id: slotId, doctorId: doctor.id },
      });
  
      if (!slot) throw new NotFoundException('Slot not found');
  
      return this.prisma.slot.update({
        where: { id: slotId },
        data: { maxBookings: updateSlotDto.maxBookings },
      });
    }

  // 4. DELETE a slot (only if no appointments are booked for that slot)
 async remove(userId: number, slotId: number) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });

    // ALIGNMENT: Check if any slots are booked before deleting
    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, doctorId: doctor.id },
      include: { times: { where: { isBooked: true } } }
    });

    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.times.length > 0) {
      throw new BadRequestException('Cannot delete slot with existing bookings');
    }

    return this.prisma.slot.delete({
      where: { id: slotId },
    });
  }
}