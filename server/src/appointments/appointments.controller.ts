import { Controller, Post, Get, Patch, Body, Param, ParseIntPipe, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) { }

  @Post()
  create(@Request() req, @Body() createAppointmentDto: CreateAppointmentDto) {
    return this.appointmentsService.create(req.user.userId, createAppointmentDto);
  }

  @Get('patient')
  findAll(@Request() req) {
    return this.appointmentsService.findAll(req.user.userId, req.user.role);
  }

  @Get('doctor')
  getDoctorSchedule(@Request() req) {
    if (req.user.role !== 'DOCTOR') {
      throw new BadRequestException('Only doctors can access the schedule');
    }
    return this.appointmentsService.findAll(req.user.userId, 'DOCTOR');
  }

  @Patch(':id/cancel')
  cancel(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.cancel(req.user.userId, id, req.user.role);
  }
}