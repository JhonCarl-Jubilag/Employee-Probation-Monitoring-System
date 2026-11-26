import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import {
  Employee,
  EmploymentStatus,
} from '../employees/entities/employee.entity';
import {
  Evaluation,
  EvaluationStatus,
} from '../evaluations/entities/evaluation.entity';
import {
  ProbationRecord,
  ProbationStatus,
} from '../probation-records/entities/probation-record.entity';
import { UserRole } from '../users/entities/user.entity';
import { CreateDecisionDto } from './dto/create-decision.dto';
import {
  DecisionType,
  RegularizationDecision,
} from './entities/regularization-decision.entity';

@Injectable()
export class RegularizationDecisionsService {
  constructor(
    @InjectRepository(RegularizationDecision)
    private readonly decisionsRepository: Repository<RegularizationDecision>,
    @InjectRepository(Evaluation)
    private readonly evaluationsRepository: Repository<Evaluation>,
    @InjectRepository(ProbationRecord)
    private readonly recordsRepository: Repository<ProbationRecord>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateDecisionDto,
    actor: AuthenticatedUser,
  ): Promise<RegularizationDecision> {
    if (actor.role !== UserRole.HR_ADMIN)
      throw new ForbiddenException(
        'Only HR administrators can record decisions',
      );
    const snapshot = await this.evaluationsRepository.findOne({
      where: { id: dto.evaluationId },
    });
    if (!snapshot) throw new NotFoundException('Evaluation not found');
    const period = await this.recordsRepository.findOne({
      where: { id: snapshot.probationRecordId },
    });
    if (!period) throw new NotFoundException('Probation record not found');

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Match the employee -> probation -> evaluation lock order used by the other workflows.
        const employee = await manager.getRepository(Employee).findOne({
          where: { id: period.employeeId },
          lock: { mode: 'pessimistic_write' },
        });
        const record = await manager.getRepository(ProbationRecord).findOne({
          where: { id: period.id },
          lock: { mode: 'pessimistic_write' },
        });
        const evaluations = manager.getRepository(Evaluation);
        const evaluation = await evaluations.findOne({
          where: { id: dto.evaluationId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!record || !evaluation)
          throw new NotFoundException(
            'Evaluation or probation record not found',
          );

        const repository = manager.getRepository(RegularizationDecision);
        const existing = await repository.findOne({
          where: { evaluationId: evaluation.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (existing)
          throw new ConflictException(
            'This evaluation already has an HR decision',
          );
        if (
          evaluation.status !== EvaluationStatus.SUBMITTED ||
          !evaluation.submittedAt
        ) {
          throw new ConflictException(
            'HR decisions require a submitted evaluation',
          );
        }
        if (
          !record.isActive ||
          record.status !== ProbationStatus.FOR_HR_REVIEW
        ) {
          throw new ConflictException(
            'This probation record is not awaiting HR review',
          );
        }
        if (
          !employee?.isActive ||
          employee.employmentStatus !== EmploymentStatus.PROBATIONARY
        ) {
          throw new ConflictException(
            'The employee must be active and probationary',
          );
        }
        const latest = await evaluations.findOne({
          where: { probationRecordId: record.id },
          order: { sequenceNumber: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!latest || String(latest.id) !== String(evaluation.id)) {
          throw new ConflictException(
            'Decide on the latest evaluation for this probation record',
          );
        }

        const today = this.manilaDate(new Date());
        const submittedDate = this.manilaDate(evaluation.submittedAt);
        if (
          dto.decisionDate < submittedDate ||
          dto.decisionDate < record.startDate ||
          dto.decisionDate > today
        ) {
          throw new BadRequestException(
            'Decision date must be on or after submission and probation start, and cannot be in the future (Asia/Manila)',
          );
        }
        const newEndDate = this.extensionEndDate(dto, record);
        const decision = repository.create({
          probationRecordId: record.id,
          evaluationId: evaluation.id,
          decidedByUserId: Number(actor.id),
          decision: dto.decision,
          decisionDate: dto.decisionDate,
          remarks: dto.remarks?.trim() || null,
          previousEndDate:
            dto.decision === DecisionType.EXTENDED
              ? record.expectedEndDate
              : null,
          newEndDate,
        });
        const saved = await repository.save(decision);

        if (newEndDate !== null) {
          record.expectedEndDate = newEndDate;
          record.status = ProbationStatus.UNDER_PROBATION;
        } else {
          employee.employmentStatus =
            dto.decision === DecisionType.REGULARIZED
              ? EmploymentStatus.REGULAR
              : EmploymentStatus.SEPARATED;
          record.status = ProbationStatus.COMPLETED;
          record.isActive = false;
          await manager.getRepository(Employee).save(employee);
        }
        await manager.getRepository(ProbationRecord).save(record);
        return saved;
      });
    } catch (error: unknown) {
      if (error instanceof QueryFailedError) {
        const driverError: unknown = error.driverError;
        if (
          typeof driverError === 'object' &&
          driverError !== null &&
          'code' in driverError &&
          driverError.code === 'ER_DUP_ENTRY'
        ) {
          throw new ConflictException(
            'This evaluation already has an HR decision',
          );
        }
      }
      throw error;
    }
  }

  async findAll(actor: AuthenticatedUser): Promise<RegularizationDecision[]> {
    return this.decisionsRepository.find({
      where: this.scope(actor),
      relations: { probationRecord: { employee: true } },
      order: { id: 'DESC' },
    });
  }

  async findOne(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<RegularizationDecision> {
    const decision = await this.decisionsRepository.findOne({
      where: { ...this.scope(actor), id },
      relations: { probationRecord: { employee: true } },
    });
    if (!decision) throw new NotFoundException('HR decision not found');
    return decision;
  }

  private scope(
    actor: AuthenticatedUser,
  ): FindOptionsWhere<RegularizationDecision> {
    if (actor.role === UserRole.HR_ADMIN) return {};
    if (actor.role === UserRole.SUPERVISOR) {
      return {
        evaluation: {
          supervisor: { userId: Number(actor.id), isActive: true },
        },
      };
    }
    if (actor.role === UserRole.EMPLOYEE) {
      return { probationRecord: { employee: { userId: Number(actor.id) } } };
    }
    throw new ForbiddenException('Your role cannot access HR decisions');
  }

  private extensionEndDate(
    dto: CreateDecisionDto,
    record: ProbationRecord,
  ): string | null {
    if (dto.decision !== DecisionType.EXTENDED) {
      if (dto.newEndDate != null)
        throw new BadRequestException(
          'newEndDate is only allowed for EXTENDED decisions',
        );
      return null;
    }
    if (
      !dto.newEndDate ||
      dto.newEndDate <= record.expectedEndDate ||
      dto.newEndDate <= dto.decisionDate
    ) {
      throw new BadRequestException(
        'An extension needs a new end date after the previous end date and decision date',
      );
    }
    return dto.newEndDate;
  }

  private manilaDate(date: Date): string {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
