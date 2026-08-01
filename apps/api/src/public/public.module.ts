import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PublicService } from './public.service';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicAppointmentsController } from './public-appointments.controller';
import { PublicWaitlistController } from './public-waitlist.controller';
import { AppointmentsModule } from '../appointments/appointments.module';

/**
 * Flujo del paciente por web (sec 5.2 / 6.2). Registra su propio JwtModule
 * porque PatientJwtGuard necesita JwtService y AuthModule no exporta JwtModule.
 */
@Module({
  imports: [
    AppointmentsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'change-me',
      }),
    }),
  ],
  controllers: [PublicCatalogController, PublicAppointmentsController, PublicWaitlistController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
