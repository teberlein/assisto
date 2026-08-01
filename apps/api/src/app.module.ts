import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { ServiceTypesModule } from './service-types/service-types.module';
import { AvailabilityModule } from './availability/availability.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { PublicModule } from './public/public.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { ReassignmentModule } from './reassignment/reassignment.module';
import { RemindersModule } from './reminders/reminders.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    // El .env vive en la raíz del monorepo, no en apps/api. `nest start` corre
    // con cwd=apps/api, así que hay que apuntarlo explícitamente.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '..', '..', '.env'), '.env'],
    }),
    // Rate limiting global: 120 req/min por IP. Los endpoints públicos
    // (OTP, registro, booking) lo aprietan más con su propio @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    EventEmitterModule.forRoot(),
    PrismaModule,
    QueueModule,
    NotificationsModule,
    AuthModule,
    AccountsModule,
    ProfessionalsModule,
    ServiceTypesModule,
    AvailabilityModule,
    PatientsModule,
    SchedulingModule,
    AppointmentsModule,
    PublicModule,
    WaitlistModule,
    ReassignmentModule,
    RemindersModule,
    IntegrationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
