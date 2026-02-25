import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DoctorService } from './doctor/doctor.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, DoctorService, ],
  exports: [UsersService],
})
export class UsersModule {}
