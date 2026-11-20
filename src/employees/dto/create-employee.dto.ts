import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @Length(1, 30)
  @Matches(/\S/, {
    message: 'employeeNumber must not contain only spaces',
  })
  employeeNumber!: string;

  @IsString()
  @Length(1, 100)
  @Matches(/\S/, {
    message: 'firstName must not contain only spaces',
  })
  firstName!: string;

  @IsString()
  @Length(1, 100)
  @Matches(/\S/, {
    message: 'lastName must not contain only spaces',
  })
  lastName!: string;

  @IsString()
  @Length(1, 100)
  @Matches(/\S/, {
    message: 'department must not contain only spaces',
  })
  department!: string;

  @IsString()
  @Length(1, 100)
  @Matches(/\S/, {
    message: 'position must not contain only spaces',
  })
  position!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateHired must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  dateHired!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  userId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  supervisorId?: number | null;
}
