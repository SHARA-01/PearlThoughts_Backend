import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as argon2 from 'argon2';
import { Prisma } from 'src/generated/prisma/client';
import { addMinutes, format, isBefore,  parse } from 'date-fns';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async create(createUserDto: CreateUserDto) {
    const { email, password, role, ...profileData } = createUserDto;

    // 1. Check for existing user
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    // 2. Hash Password
    const hashedPassword = password ? await argon2.hash(password) : null;

    // 3. Prepare the base User data
    const userRole = role || 'PATIENT';
  

    // We define the input type strictly to allow dynamic field assignment
    const data: Prisma.UserCreateInput = {
      email,
      password: hashedPassword,
      name: createUserDto.name,
      role: userRole,
    };

    if (userRole === 'DOCTOR') {
      if (!profileData.specialization || profileData.experienceYears === undefined) {
        throw new BadRequestException('Doctors must provide specialization and experience years');
      }

      data.doctor = {
        create: {
          specialization: profileData.specialization,
          experienceYears: profileData.experienceYears,
        },
      };
    } else if (userRole === 'PATIENT') {
      data.patient = {
        create: {
          gender: profileData.gender || null,
        },
      };
    }

    const user = await this.prisma.user.create({
      data,
      include: {
        doctor: true,
        patient: true,
      },
    });

    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        doctor: true,
        patient: true,
      }
    });
  }

  async findOne(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        doctor: true,
        patient: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email }
    });
  }

  async signout(userId: number) {
    return { message: 'Signed out successfully' };
  }

  // for doctors related logic
 
}
