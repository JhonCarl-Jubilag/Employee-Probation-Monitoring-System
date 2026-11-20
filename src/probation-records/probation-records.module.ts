import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProbationRecord } from './entities/probation-record.entity';
import { ProbationRecordsController } from './probation-records.controller';
import { ProbationRecordsService } from './probation-records.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProbationRecord])],
  controllers: [ProbationRecordsController],
  providers: [ProbationRecordsService],
  exports: [TypeOrmModule, ProbationRecordsService],
})
export class ProbationRecordsModule {}
