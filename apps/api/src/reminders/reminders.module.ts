import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { RemindersService } from './reminders.service';

// Fase 5 (sec 5.4). No expone controllers: todo se dispara por eventos de
// AppointmentsService y por jobs de la cola.
@Module({
  imports: [AppointmentsModule],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
