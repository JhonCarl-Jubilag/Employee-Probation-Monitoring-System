import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegularizationDecision } from './entities/regularization-decision.entity';
import { Evaluation } from '../evaluations/entities/evaluation.entity';
import { ProbationRecord } from '../probation-records/entities/probation-record.entity';
import { RegularizationDecisionsController } from './regularization-decisions.controller';
import { RegularizationDecisionsService } from './regularization-decisions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RegularizationDecision,
      Evaluation,
      ProbationRecord,
    ]),
  ],
  controllers: [RegularizationDecisionsController],
  providers: [RegularizationDecisionsService],
  exports: [TypeOrmModule, RegularizationDecisionsService],
})
export class RegularizationDecisionsModule {}
