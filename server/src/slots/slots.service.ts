import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';

@Injectable()
export class SlotsService {
  constructor(private prisma: PrismaService) {}

 
  async create(userId: number, createSlotDto: CreateSlotDto) {
    const { startTime, endTime, dayOfWeek } = createSlotDto;

    // Validate Time
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new BadRequestException('User is not a doctor');

    // C. Overlap Check 
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

   
    return this.prisma.slot.create({
      data: {
        ...createSlotDto,
        doctorId: doctor.id,
      },
    });
  }

  // 2. GET MY SLOTS (Sorted)
  async findMySlots(userId: number) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new BadRequestException('User is not a doctor');

    const slots = await this.prisma.slot.findMany({
      where: { doctorId: doctor.id },
    });

    // Sort: Monday -> Sunday, then by Time
    const dayOrder = {
      'MONDAY': 1, 'TUESDAY': 2, 'WEDNESDAY': 3, 'THURSDAY': 4,
      'FRIDAY': 5, 'SATURDAY': 6, 'SUNDAY': 7
    };

    return slots.sort((a, b) => {
      const dayDiff = dayOrder[a.dayOfWeek] - dayOrder[b.dayOfWeek];
      if (dayDiff !== 0) return dayDiff;
      return a.startTime.localeCompare(b.startTime);
    });
  }

  // 3. UPDATE LIMIT (slots numbesrs)
  async updateSlotLimit(userId: number, slotId: number, updateSlotDto: UpdateSlotDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    
    // Check ownership
    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, doctorId: doctor.id },
    });

    if (!slot) throw new NotFoundException('Slot not found');

    return this.prisma.slot.update({
      where: { id: slotId },
      data: { maxBookings: updateSlotDto.maxBookings },
    });
  }

  // 4. DELETE SLOT
  async remove(userId: number, slotId: number) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });

    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, doctorId: doctor.id },
    });

    if (!slot) throw new NotFoundException('Slot not found');

    return this.prisma.slot.delete({
      where: { id: slotId },
    });
  }
}