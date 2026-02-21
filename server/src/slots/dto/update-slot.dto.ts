import { IsInt, Min } from 'class-validator';

export class UpdateSlotDto {
  @IsInt()
  @Min(1)
  maxBookings: number; 
}