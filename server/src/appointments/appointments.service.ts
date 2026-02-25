import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) { }

  async create(patientUserId: number, createAppointmentDto: CreateAppointmentDto) {
    const { doctorId, timeId, date, notes } = createAppointmentDto;

    // Validate Patient
    const patient = await this.prisma.patient.findUnique({ where: { userId: patientUserId } });
    if (!patient) throw new BadRequestException('Patient profile not found. Are you logged in as a patient?');

    //Validate Time Chunk & Ownership
    const timeChunk = await this.prisma.time.findUnique({ 
      where: { id: timeId },
      include: { slot: true }
    });

    if (!timeChunk) throw new NotFoundException('Time slot not found');
    
    if (timeChunk.slot.doctorId !== doctorId) {
      throw new BadRequestException('This time slot does not belong to the selected doctor');
    }

    // We combine the 'date' (YYYY-MM-DD) and the 'time' (HH:mm) from the DB
    const startTimeStr = timeChunk.time.split('-')[0]; // Handle "09:00" or "09:00-11:00"
    
    // Create Date object safely (Force ISO format to avoid timezone issues)
    const appointmentDate = new Date(`${date}T${startTimeStr}:00`);
    
    // Past Date Check
    if (appointmentDate < new Date()) {
      throw new BadRequestException('Cannot book appointments in the past.');
    }

    // Rule: "A patient can only have ONE confirmed appointment with this Doctor on this Day."
    
    // Define the start and end of the requested day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointment = await this.prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        doctorId: doctorId,
        status: 'CONFIRMED', 
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    if (existingAppointment) {
      // Custom Error Message based on whether it's the exact same time or just same day
      if (existingAppointment.timeId === timeId) {
        throw new ConflictException('You have already booked this specific time slot.');
      } else {
        throw new ConflictException(`You already have an appointment with Dr. ${timeChunk.slot.doctorId} on this day.`);
      }
    }

    const reportingTime = new Date(appointmentDate);
    reportingTime.setMinutes(reportingTime.getMinutes() - 10);

    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.time.updateMany({
        where: {
          id: timeId,
          currentBookings: { lt: timeChunk.maxCapacity } 
        },
        data: {
          currentBookings: { increment: 1 }
        }
      });

      if (updateResult.count === 0) {
        throw new ConflictException('This slot is fully booked. Please refresh and try again.');
      }

      // Check if we need to close the slot (Set isBooked = true)
      const updatedTime = await tx.time.findUnique({ where: { id: timeId } });
      
      if (updatedTime.currentBookings >= updatedTime.maxCapacity) {
        await tx.time.update({
          where: { id: timeId },
          data: { isBooked: true } 
        });
      }

      // Create the Appointment
      return tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId,
          timeId,
          date: appointmentDate,
          reportingTime,
          notes,
          status: 'CONFIRMED',
        },
      });
    });
  }

  async findAll(userId: number, role: string) {
    //doctor can only Find appointments assigned to me
    // flow userId -> patientId/doctorId first
    
    let filter = {};
    if (role === 'PATIENT') {
        const patient = await this.prisma.patient.findUnique({ where: { userId } });
        if (!patient) return [];
        filter = { patientId: patient.id };
    } else if (role === 'DOCTOR') {
        const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
        if (!doctor) return [];
        filter = { doctorId: doctor.id };
    }

    return this.prisma.appointment.findMany({
      where: filter,
      include: {
        doctor: { select: { specialization: true, user: { select: { name: true } } } },
        patient: { select: { gender: true, user: { select: { name: true, email: true } } } },
        time: true 
      },
      orderBy: { date: 'asc' }
    });
  }

  //CANCEL 
  async cancel(userId: number, appointmentId: number, role: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { userId: true } },
        doctor: { select: { userId: true } }
      }
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    // Authorization Check
    if (role === 'PATIENT' && appointment.patient.userId !== userId) throw new ForbiddenException('Not your appointment');
    if (role === 'DOCTOR' && appointment.doctor.userId !== userId) throw new ForbiddenException('Not your patient');

    if (appointment.status === 'CANCELLED') throw new BadRequestException('Already cancelled');

    return this.prisma.$transaction(async (tx) => {
      //make it as Cancelled
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED' }
      });

      //Update SLOT (Decrement Count)
      // Only if the time block still exists (it might be null if the doctor deleted the slot!)
      if (appointment.timeId) {
        await tx.time.update({
          where: { id: appointment.timeId },
          data: { 
            currentBookings: { decrement: 1 }, 
            isBooked: false 
          }
        });
      }

      return { message: 'Appointment cancelled and slot capacity restored.' };
    });
  }
}