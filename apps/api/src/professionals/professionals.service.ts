import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

export interface CreateProfessionalInput {
  displayName: string;
  email: string;
  password: string;
  fullName: string;
}

@Injectable()
export class ProfessionalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, input: CreateProfessionalInput) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.user.create({
      data: {
        accountId,
        email: input.email.toLowerCase(),
        passwordHash,
        fullName: input.fullName,
        roles: [Role.PROFESSIONAL],
        professional: {
          create: {
            accountId,
            displayName: input.displayName,
          },
        },
      },
      include: { professional: true },
    });

    return user.professional!;
  }

  list(accountId: string) {
    return this.prisma.professional.findMany({
      where: { accountId },
      include: { user: { select: { email: true, fullName: true } } },
    });
  }

  async get(accountId: string, id: string) {
    const p = await this.prisma.professional.findFirst({
      where: { id, accountId },
      include: { user: { select: { email: true, fullName: true } } },
    });
    if (!p) throw new NotFoundException();
    return p;
  }

  async assertOwnedBy(professionalId: string, userId: string, accountId: string, isOwner: boolean) {
    const p = await this.prisma.professional.findUnique({ where: { id: professionalId } });
    if (!p || p.accountId !== accountId) throw new NotFoundException();
    if (!isOwner && p.userId !== userId) throw new ForbiddenException();
    return p;
  }
}
