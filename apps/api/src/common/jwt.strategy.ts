import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // userId
  accountId: string;
}

export interface RequestUser {
  userId: string;
  accountId: string;
  roles: string[];
  professionalId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { professional: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      userId: user.id,
      accountId: user.accountId,
      roles: user.roles,
      professionalId: user.professional?.id ?? null,
    };
  }
}
