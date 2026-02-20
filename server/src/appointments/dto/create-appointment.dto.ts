import { IsInt, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsInt()
  doctorId: number;

  @IsInt()
  timeId: number;

  @IsDateString()
  date: string;

  @IsString()
  time: string;

  @IsString()
  @IsOptional()
  notes?: string;
}