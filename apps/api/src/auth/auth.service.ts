import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { SignupOwnerDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signupOwner(dto: SignupOwnerDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const account = await this.prisma.account.create({
      data: {
        name: dto.accountName,
        timezone: dto.timezone ?? 'America/Argentina/Buenos_Aires',
        users: {
          create: {
            email: dto.email.toLowerCase(),
            passwordHash,
            fullName: dto.fullName,
            roles: [Role.OWNER],
          },
        },
      },
      include: { users: true },
    });

    const user = account.users[0];
    return {
      accessToken: this.sign(user.id, account.id),
      user: this.sanitize(user),
      account: { id: account.id, name: account.name, timezone: account.timezone },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return {
      accessToken: this.sign(user.id, user.accountId),
      user: this.sanitize(user),
    };
  }

  private sign(userId: string, accountId: string) {
    return this.jwt.sign({ sub: userId, accountId });
  }

  private sanitize(u: { id: string; email: string; fullName: string; roles: Role[]; accountId: string }) {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      roles: u.roles,
      accountId: u.accountId,
    };
  }
}
