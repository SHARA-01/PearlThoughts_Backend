import { IsString, IsInt, IsOptional, Matches, IsIn, IsEnum, ValidateIf, IsDateString } from 'class-validator';

export class CreateSlotDto {
  @ValidateIf(o => !o.date)
  @IsString()
  @IsIn(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])
  dayOfWeek?: string; 

  @ValidateIf(o => !o.dayOfWeek)
  @IsDateString() 
  date?: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Format must be HH:mm (e.g., 09:00)' })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Format must be HH:mm (e.g., 17:00)' })
  endTime: string;
  
  @IsOptional()
  @IsEnum(['WAVE', 'STREAM'])
  schedulingType?: string = 'STREAM'; 

  @IsInt()
  maxBookings: number;

  @IsOptional()
  @IsInt()
  slotDuration?: number;
}