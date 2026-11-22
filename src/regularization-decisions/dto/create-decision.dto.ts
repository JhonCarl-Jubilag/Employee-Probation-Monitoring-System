import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DecisionType } from '../entities/regularization-decision.entity';

export class CreateDecisionDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  evaluationId!: number;

  @IsEnum(DecisionType)
  decision!: DecisionType;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'decisionDate must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  decisionDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  remarks?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'newEndDate must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  newEndDate?: string | null;
}
