import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException();
    return account;
  }

  update(id: string, data: { name?: string; timezone?: string; whatsappNumber?: string }) {
    return this.prisma.account.update({ where: { id }, data });
  }
}
