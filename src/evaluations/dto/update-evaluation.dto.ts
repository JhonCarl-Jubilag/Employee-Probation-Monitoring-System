import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Recommendation } from '../entities/evaluation.entity';

export class UpdateEvaluationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  workQuality?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  productivity?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  attendance?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  punctuality?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  teamwork?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  initiative?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comments?: string | null;

  @IsOptional()
  @IsEnum(Recommendation)
  recommendation?: Recommendation | null;
}
