import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';
import { CurrentUser, Public, Roles } from './decorators';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

@Controller()
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const ok = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');

    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    return { accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }

  @Get('auth/me')
  async me(@CurrentUser() user: AuthUser) {
    const found = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!found) throw new UnauthorizedException();
    return found;
  }

  /** Mentors pick a learner to inspect. */
  @Roles(Role.MENTOR)
  @Get('users/learners')
  learners() {
    return this.prisma.user.findMany({
      where: { role: Role.LEARNER },
      select: { id: true, name: true, email: true },
      orderBy: { id: 'asc' },
    });
  }
}
