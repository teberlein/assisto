import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClaimService } from './claim.service';
import { ReassignmentController } from './reassignment.controller';
import { ReassignmentService } from './reassignment.service';

/**
 * Motor de reasignación (sec 6).
 *
 * Exporta `ClaimService` y `ReassignmentService` para que otros módulos los
 * inyecten — en particular el webhook de WhatsApp (fase 4), que tiene que usar
 * EXACTAMENTE el mismo `claim()` que la web (sec 6.4).
 *
 * Registra JwtModule por su cuenta porque `PatientJwtGuard` necesita JwtService
 * y AuthModule no lo re-exporta.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'change-me',
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d',
        },
      }),
    }),
  ],
  controllers: [ReassignmentController],
  providers: [ReassignmentService, ClaimService],
  exports: [ReassignmentService, ClaimService],
})
export class ReassignmentModule {}
