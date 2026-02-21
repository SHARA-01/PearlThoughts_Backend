import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto'; // Ensure this extends CreateUserDto structure
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);

    if (user && user.password && await argon2.verify(user.password, password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    let profileId = null;
    
    if (user.role === 'PATIENT' && user.patient) {
      profileId = user.patient.id;
    } else if (user.role === 'DOCTOR' && user.doctor) {
      profileId = user.doctor.id;
    }

    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      profileId: profileId 
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        doctor: user.doctor, 
        patient: user.patient,
      }
    };
  }

  async register(registerDto: RegisterDto) {
    return this.usersService.create(registerDto);
  }

  async loginGoogle(userData: any) {
    let user = await this.usersService.findByEmail(userData.email);

    if (!user) {
      user = await this.usersService.create({
        email: userData.email,
        name: userData.name || 'Google User', 
        password: null, 
        role: 'PATIENT', 
      });
    }

   
    return this.login(user);
  }
}