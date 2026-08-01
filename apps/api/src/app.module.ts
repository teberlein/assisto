import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { ServiceTypesModule } from './service-types/service-types.module';
import { AvailabilityModule } from './availability/availability.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    ProfessionalsModule,
    ServiceTypesModule,
    AvailabilityModule,
    PatientsModule,
    AppointmentsModule,
    WaitlistModule,
  ],
})
export class AppModule {}
