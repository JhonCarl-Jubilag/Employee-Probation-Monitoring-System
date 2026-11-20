import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UserRole } from '../users/entities/user.entity';
import { CreateProbationRecordDto } from './dto/create-probation-record.dto';
import { UpdateProbationRecordDto } from './dto/update-probation-record.dto';
import { ProbationRecordsService } from './probation-records.service';

@Controller('probation-records')
@Roles(UserRole.HR_ADMIN)
export class ProbationRecordsController {
  constructor(private readonly recordsService: ProbationRecordsService) {}

  @Post()
  create(
    @Body() dto: CreateProbationRecordDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recordsService.create(dto, request.user.id);
  }

  @Get()
  findAll() {
    return this.recordsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recordsService.findOne(this.validateId(id));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProbationRecordDto,
  ) {
    return this.recordsService.update(this.validateId(id), dto);
  }

  @Delete(':id')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.recordsService.deactivate(this.validateId(id));
  }

  private validateId(id: number): number {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException(
        'Record ID must be a positive safe integer',
      );
    }
    return id;
  }
}
