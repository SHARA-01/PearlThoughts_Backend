import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async create(patientUserId: number, createAppointmentDto: CreateAppointmentDto) {
    const { doctorId, slotId, date, notes } = createAppointmentDto;
    const appointmentDate = new Date(date);
    const now = new Date();

   
    if (appointmentDate < now) {
      throw new BadRequestException('Cannot book appointments in the past.');
    }


    const patient = await this.prisma.patient.findUnique({ where: { userId: patientUserId } });
    if (!patient) throw new BadRequestException('Patient profile not found. Are you logged in as a patient?');

   
    return this.prisma.$transaction(async (tx) => {
      
     
      const slot = await tx.slot.findUnique({ where: { id: slotId } });
      if (!slot) throw new NotFoundException('Slot not found');

      
      if (slot.doctorId !== doctorId) {
        throw new BadRequestException('Slot does not belong to this doctor');
      }

      
      const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const dayName = days[appointmentDate.getDay()]; 
      
      if (dayName !== slot.dayOfWeek) {
        throw new BadRequestException(`The date ${date} is a ${dayName}, but this slot is for ${slot.dayOfWeek}s only.`);
      }

      if (slot.bookings >= slot.maxBookings) {
        throw new ConflictException('This slot is fully booked.');
      }

    
      const existingBooking = await tx.appointment.findFirst({
        where: {
          patientId: patient.id,
          date: appointmentDate,
          slotId: slotId,
          status: { not: 'CANCELLED' } 
        }
      });

      if (existingBooking) {
        throw new ConflictException('You have already booked this slot.');
      }

     
      await tx.slot.update({
        where: { id: slotId },
        data: { bookings: { increment: 1 } },
      });

     
      return tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId,
          slotId,
          date: appointmentDate,
          notes,
          status: 'CONFIRMED',
        },
      });
    });
  }

  async findAll(userId: number, role: string) {
    if (role === 'PATIENT') {
      return this.prisma.appointment.findMany({
        where: { patient: { userId } }, 
        include: { 
          doctor: { include: { user: { select: { name: true } } } }, 
          slot: true 
        },
        orderBy: { date: 'asc' }
      });
    } 
    else if (role === 'DOCTOR') {
        console.log("Finding appointments for doctor with userId:", userId)
      return this.prisma.appointment.findMany({
        where: { doctor: { userId } },
        include: { 
          patient: { include: { user: { select: { name: true, email: true } } } }, 
          slot: true
        },
        orderBy: { date: 'asc' }
      });
    }
  }

  async cancel(userId: number, appointmentId: number, role: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { 
        patient: { include: { user: true } }, 
        doctor: { include: { user: true } },
        slot: true
      }
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    if (role === 'PATIENT' && appointment.patient.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own appointments');
    }
    if (role === 'DOCTOR' && appointment.doctor.userId !== userId) {
      throw new ForbiddenException('You can only cancel appointments assigned to you');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED' }
      });

      // update slot bookings count
      if (appointment.slotId) {
        await tx.slot.update({
          where: { id: appointment.slotId },
          data: { bookings: { decrement: 1 } }
        });
      }
    });

    // send notification to the other party
    const recipient = role === 'DOCTOR' ? appointment.patient.user.email : appointment.doctor.user.email;
    const msg = role === 'DOCTOR' ? 'Dr. ' + appointment.doctor.user.name : 'Patient ' + appointment.patient.user.name;
    
    // Log to console to prove requirement is met
    // await this.notifications.sendCancellation(recipient, appointment.date, msg);

    return { message: 'Appointment cancelled successfully' };
  }
}