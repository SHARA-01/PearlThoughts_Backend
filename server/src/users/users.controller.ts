import { Controller, Get, Post, Body, Param, ParseIntPipe, Query,  } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get("doctors")
  async findAllDoctors(@Query('specialization') specialization?: string) {
    console.log("Finding doctors with specialization:", specialization);
    return this.prisma.doctor.findMany({
      where: {
        specialization: specialization ? { contains: specialization, mode: 'insensitive' } : undefined,
        isAvailable: true,
      },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }
}
