import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UserRole } from '../users/entities/user.entity';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { RegularizationDecisionsService } from './regularization-decisions.service';

@Controller('regularization-decisions')
@Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR, UserRole.EMPLOYEE)
export class RegularizationDecisionsController {
  constructor(
    private readonly decisionsService: RegularizationDecisionsService,
  ) {}

  @Post()
  @Roles(UserRole.HR_ADMIN)
  create(@Body() dto: CreateDecisionDto, @Req() request: AuthenticatedRequest) {
    return this.decisionsService.create(dto, request.user);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.decisionsService.findAll(request.user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException(
        'Decision ID must be a positive safe integer',
      );
    return this.decisionsService.findOne(id, request.user);
  }
}
