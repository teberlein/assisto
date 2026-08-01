import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { ProfessionalsModule } from '../professionals/professionals.module';

@Module({
  imports: [ProfessionalsModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}
