import { IsString, IsInt, IsOptional, Matches, IsIn, Min } from 'class-validator';

export class CreateSlotDto {
  @IsString()
  @IsIn(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])
  dayOfWeek: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Format must be HH:mm (e.g., 09:00)' })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Format must be HH:mm (e.g., 17:00)' })
  endTime: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxBookings?: number; // Defaults to 10 if not provided
}