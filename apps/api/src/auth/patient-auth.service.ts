import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RequestPatientOtpDto, VerifyPatientOtpDto } from './dto';

// Auth de paciente por OTP a WhatsApp.
// Fase 1: canal simulado (log del código en consola, o fixed dev code).
// Fase 4: se reemplaza el envío por Kapso.
@Injectable()
export class PatientAuthService {
  private readonly logger = new Logger(PatientAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(dto: RequestPatientOtpDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { phone: dto.phone },
    });
    if (!patient) throw new NotFoundException('Patient not registered');

    const simulated = this.config.get('OTP_SIMULATED') !== 'false';
    const code = simulated
      ? this.config.get<string>('OTP_DEV_CODE') ?? '000000'
      : this.generateCode();

    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.patientOtpChallenge.create({
      data: { patientId: patient.id, codeHash, expiresAt },
    });

    if (simulated) {
      this.logger.warn(
        `[OTP SIMULATED] patient=${patient.phone} code=${code} (expira ${expiresAt.toISOString()})`,
      );
    } else {
      // fase 4: enviar por Kapso
      this.logger.log(`Sending OTP via WhatsApp to ${patient.phone}`);
    }

    return { sent: true, simulated };
  }

  async verifyOtp(dto: VerifyPatientOtpDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { phone: dto.phone },
    });
    if (!patient) throw new UnauthorizedException();

    const challenge = await this.prisma.patientOtpChallenge.findFirst({
      where: {
        patientId: patient.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw new UnauthorizedException('OTP expired or missing');

    const ok = await bcrypt.compare(dto.code, challenge.codeHash);
    if (!ok) throw new UnauthorizedException('Invalid OTP');

    await this.prisma.patientOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    // Token específico del paciente (no tiene accountId; los tokens de profesional sí)
    const accessToken = this.jwt.sign({
      sub: patient.id,
      scope: 'patient',
    });

    return {
      accessToken,
      patient: {
        id: patient.id,
        phone: patient.phone,
        fullName: patient.fullName,
      },
    };
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
