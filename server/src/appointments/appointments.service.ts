import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) { }

  async create(patientUserId: number, createAppointmentDto: CreateAppointmentDto) {
    const { doctorId, timeId, date, notes } = createAppointmentDto;

    const [hours, minutes] = createAppointmentDto.time.split(':');
    const appointmentDate = new Date(date);
    appointmentDate.setHours(parseInt(hours), parseInt(minutes));

    const now = new Date();


    if (appointmentDate < now) {
      throw new BadRequestException('Cannot book appointments in the past.');
    }


    const patient = await this.prisma.patient.findUnique({ where: { userId: patientUserId } });
    if (!patient) throw new BadRequestException('Patient profile not found. Are you logged in as a patient?');


    return this.prisma.$transaction(async (tx) => {
      const timeSlot = await tx.time.findUnique({
        where: { id: timeId },
        include: { slot: true }
      });


      if (!timeSlot) throw new NotFoundException('Time slot not found');

      if (timeSlot.slot.doctorId !== doctorId) {
        throw new BadRequestException('This slot does not belong to the selected doctor');
      }

      if (timeSlot.isBooked) {
        throw new ConflictException('This specific time is already booked.');
      }

      await tx.time.update({
        where: { id: timeId },
        data: { isBooked: true }
      });

      const reportingTime = new Date(appointmentDate);
      reportingTime.setMinutes(reportingTime.getMinutes() - 10);

      return tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId,
          timeId: timeId,
          date: appointmentDate,
          reportingTime: reportingTime,
          notes,
          status: 'CONFIRMED',
        },
      });
    });
  }

  async findAll(userId: number, role: string) {
    const filter = role === 'PATIENT' ? { patient: { userId } } : { doctor: { userId } };

    return this.prisma.appointment.findMany({
      where: filter,
      include: {
        doctor: { include: { user: { select: { name: true } } } },
        patient: { include: { user: { select: { name: true, email: true } } } },
        time: true
      },
      orderBy: { date: 'asc' }
    });
  }



  async cancel(userId: number, appointmentId: number, role: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { userId: true } },
        doctor: { select: { userId: true } }
      }
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    if (role === 'PATIENT' && appointment.patient.userId !== userId) throw new ForbiddenException();
    if (role === 'DOCTOR' && appointment.doctor.userId !== userId) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED' }
      });

      //! IMPORTANT: Free up the time slot again
      await tx.time.update({
        where: { id: appointment.timeId },
        data: { isBooked: false }
      });

      return { message: 'Cancelled and slot is now free.' };
    });
  }
}