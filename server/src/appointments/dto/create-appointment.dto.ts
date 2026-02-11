import { IsInt, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsInt()
  doctorId: number; 

  @IsInt()
  slotId: number; 

  @IsDateString()
  date: string;  

  @IsString()
  @IsOptional()
  notes?: string; 
}