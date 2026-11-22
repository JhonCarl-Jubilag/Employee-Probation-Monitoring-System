import { IsDateString, IsInt, Matches, Max, Min } from 'class-validator';

export class CreateEvaluationDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  probationRecordId!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduledDate must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  scheduledDate!: string;
}
