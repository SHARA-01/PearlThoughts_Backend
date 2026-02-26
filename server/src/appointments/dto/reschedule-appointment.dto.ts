import { IsInt, IsNotEmpty, IsString, IsDateString, IsOptional } from 'class-validator';

export class RescheduleAppointmentDto {
  @IsInt()
  @IsNotEmpty()
  newTimeId: number; 

  @IsDateString()
  @IsNotEmpty()
  newDate: string;   

  @IsString()
  @IsOptional()
  reason?: string;  
}