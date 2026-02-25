import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, } from '@nestjs/common';
import { UsersService } from './users.service';
import { DoctorService } from './doctor/doctor.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, private readonly doctorService: DoctorService) { }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id/availability')
  async getAvailability(
    @Param('id', ParseIntPipe) doctorId: number,
    @Query('date') date: string // Format: YYYY-MM-DD
  ) {
    return this.doctorService.getDoctorAvailability(doctorId, date);
  }

  @Get("doctors")
  findAllDoctors(@Query('specialization') specialization?: string) {
    return this.doctorService.findAllDoctors(specialization);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }
}
