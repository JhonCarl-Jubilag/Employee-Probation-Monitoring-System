import { PartialType, PickType } from '@nestjs/mapped-types';
import { CreateProbationRecordDto } from './create-probation-record.dto';

export class UpdateProbationRecordDto extends PartialType(
  PickType(CreateProbationRecordDto, ['startDate', 'expectedEndDate'] as const),
  { skipNullProperties: false },
) {}
