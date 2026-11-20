import { IsDateString, IsInt, Matches, Max, Min } from 'class-validator';

export class CreateProbationRecordDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  employeeId!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'expectedEndDate must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  expectedEndDate!: string;
}
