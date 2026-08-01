import { Module } from '@nestjs/common';
import { ServiceTypesController } from './service-types.controller';
import { ServiceTypesService } from './service-types.service';
import { ProfessionalsModule } from '../professionals/professionals.module';

@Module({
  imports: [ProfessionalsModule],
  controllers: [ServiceTypesController],
  providers: [ServiceTypesService],
})
export class ServiceTypesModule {}
