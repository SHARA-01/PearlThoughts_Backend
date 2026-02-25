import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { addMinutes, format, parse } from 'date-fns';

@Injectable()
export class SlotsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: number, createSlotDto: CreateSlotDto) {
    const { 
      startTime, endTime, dayOfWeek, date, 
      schedulingType, maxBookings, slotDuration 
    } = createSlotDto;

    // --- Validation ---
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    if (!dayOfWeek && !date) {
      throw new BadRequestException('You must provide either a dayOfWeek (recurring) or a date (override)');
    }

    if (schedulingType === 'WAVE' && !slotDuration) {
      throw new BadRequestException('WAVE scheduling requires a slotDuration (e.g., 15 or 30 minutes)');
    }

    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new BadRequestException('User is not a doctor');

    // --- Overlap Check ---
    // We check for overlap on the specific date OR the recurring day
    const overlappingSlot = await this.prisma.slot.findFirst({
      where: {
        doctorId: doctor.id,
        // Check if day matches OR specific date matches
        OR: [
          { date: date || undefined }, 
          { dayOfWeek: dayOfWeek || undefined } 
        ],
        // AND time overlaps
        AND: [
          {
            OR: [
              { startTime: { lte: startTime }, endTime: { gt: startTime } },
              { startTime: { lt: endTime }, endTime: { gte: endTime } },
              { startTime: { gte: startTime }, endTime: { lte: endTime } }
            ]
          }
        ]
      }
    });

    if (overlappingSlot) {
      throw new ConflictException(`Slot overlaps with an existing schedule on ${date || dayOfWeek}`);
    }

    // --- Time Chunk Generation ---
    const timeIntervals = [];

    if (schedulingType === 'STREAM') {
      // 🟢 STREAM: Create ONE single time entity for the whole window.
      // The capacity applies to the whole shift (First come, first serve).
      timeIntervals.push({
        time: `${startTime}-${endTime}`, // e.g., "09:00-11:00"
        maxCapacity: maxBookings,        // e.g., 10
        currentBookings: 0,
        isBooked: false,
      });
    } 
    else {
      // 🌊 WAVE: Loop and create multiple chunks.
      // The capacity applies per chunk.
      let current = parse(startTime, 'HH:mm', new Date());
      const end = parse(endTime, 'HH:mm', new Date());
      const duration = slotDuration || 30; // Default to 30 if undefined, though validation catches this

      while (current < end) {
        timeIntervals.push({
          time: format(current, 'HH:mm'), // e.g., "09:00", "09:30"
          maxCapacity: maxBookings,       // e.g., 3 per chunk
          currentBookings: 0,
          isBooked: false,
        });
        current = addMinutes(current, duration);
      }
    }

    // --- Save to Database ---
    return this.prisma.slot.create({
      data: {
        doctorId: doctor.id,
        dayOfWeek,
        date,
        startTime,
        endTime,
        schedulingType: schedulingType || 'STREAM', // Default fallback
        maxBookings, // Saved for reference
        times: {
          create: timeIntervals,
        },
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
      orderBy: [
        { date: 'asc' },      
        { dayOfWeek: 'asc' }, 
        { startTime: 'asc' }
      ]
    });
  }

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

  async remove(userId: number, slotId: number) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });

    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, doctorId: doctor.id },
      include: { 
        times: { 
          where: { currentBookings: { gt: 0 } } 
        } 
      }
    });

    if (!slot) throw new NotFoundException('Slot not found');
   
    if (slot.times.length > 0) {
      throw new BadRequestException('Cannot delete slot because patients have already booked appointments. Please cancel them first.');
    }

    return this.prisma.slot.delete({
      where: { id: slotId },
    });
  }
}