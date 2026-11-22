import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UserRole } from '../users/entities/user.entity';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { EvaluationsService } from './evaluations.service';

@Controller('evaluations')
@Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR, UserRole.EMPLOYEE)
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post()
  @Roles(UserRole.HR_ADMIN)
  create(@Body() dto: CreateEvaluationDto) {
    return this.evaluationsService.create(dto);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.evaluationsService.findAll(request.user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.findOne(this.validateId(id), request.user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERVISOR)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEvaluationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.update(
      this.validateId(id),
      dto,
      request.user,
    );
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPERVISOR)
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.submit(this.validateId(id), request.user);
  }

  private validateId(id: number): number {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException(
        'Evaluation ID must be a positive safe integer',
      );
    }
    return id;
  }
}
