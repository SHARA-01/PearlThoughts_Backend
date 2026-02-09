// dto/create-user.dto.ts
import { IsEmail, IsString, IsOptional, IsInt, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional() 
  role?: 'PATIENT' | 'DOCTOR';

  // for doctores
  @IsString()
  @IsOptional()
  specialization?: string;

  @IsInt()
  @IsOptional()
  experienceYears?: number;

  // for patients
  @IsString()
  @IsOptional()
  gender?: string;
}