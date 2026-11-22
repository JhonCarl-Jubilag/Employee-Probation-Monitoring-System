import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Evaluation } from './entities/evaluation.entity';
import { ProbationRecord } from '../probation-records/entities/probation-record.entity';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Evaluation, ProbationRecord])],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [TypeOrmModule, EvaluationsService],
})
export class EvaluationsModule {}
