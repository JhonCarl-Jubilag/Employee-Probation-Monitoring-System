import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegularizationDecision } from './entities/regularization-decision.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RegularizationDecision])],
  exports: [TypeOrmModule],
})
export class RegularizationDecisionsModule {}
