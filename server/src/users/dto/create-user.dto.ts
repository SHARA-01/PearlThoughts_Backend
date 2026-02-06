import { IsEmail, IsString, IsOptional, MinLength, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['PATIENT', 'DOCTOR', 'ADMIN'])
  role?: 'PATIENT' | 'DOCTOR' | 'ADMIN';
}
