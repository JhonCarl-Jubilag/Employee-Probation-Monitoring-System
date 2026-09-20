import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProbationRecord } from './entities/probation-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProbationRecord])],
  exports: [TypeOrmModule],
})
export class ProbationRecordsModule {}
