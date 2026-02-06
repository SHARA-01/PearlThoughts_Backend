import { IsEmail, IsString, IsOptional, MinLength, IsEnum } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['PATIENT', 'DOCTOR'])
  role?: 'PATIENT' | 'DOCTOR';  
}
