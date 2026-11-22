import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import {
  Employee,
  EmploymentStatus,
} from '../employees/entities/employee.entity';
import {
  ProbationRecord,
  ProbationStatus,
} from '../probation-records/entities/probation-record.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import {
  Evaluation,
  EvaluationStatus,
  Recommendation,
} from './entities/evaluation.entity';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectRepository(Evaluation)
    private readonly evaluationsRepository: Repository<Evaluation>,
    @InjectRepository(ProbationRecord)
    private readonly recordsRepository: Repository<ProbationRecord>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateEvaluationDto): Promise<Evaluation> {
    return this.withLockedProbation(
      dto.probationRecordId,
      async (manager, record, employee) => {
        if (record.status !== ProbationStatus.UNDER_PROBATION) {
          throw new ConflictException(
            'This probation record is not ready for a new evaluation',
          );
        }
        if (
          dto.scheduledDate < record.startDate ||
          dto.scheduledDate > record.expectedEndDate
        ) {
          throw new BadRequestException(
            'Schedule the evaluation within the probation period',
          );
        }
        if (
          employee.supervisorId === null ||
          String(employee.supervisorId) === String(employee.id)
        ) {
          throw new BadRequestException(
            'Assign a supervisor to the employee first',
          );
        }

        const supervisor = await manager.getRepository(Employee).findOne({
          where: { id: employee.supervisorId },
        });
        const supervisorUser =
          supervisor?.userId == null
            ? null
            : await manager.getRepository(User).findOne({
                where: { id: supervisor.userId },
              });
        if (
          !supervisor?.isActive ||
          !supervisorUser?.isActive ||
          supervisorUser.role !== UserRole.SUPERVISOR
        ) {
          throw new BadRequestException(
            'The supervisor needs an active employee record and an active SUPERVISOR account',
          );
        }

        const repository = manager.getRepository(Evaluation);
        const previous = await repository.findOne({
          where: { probationRecordId: record.id },
          order: { sequenceNumber: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (previous && previous.status !== EvaluationStatus.SUBMITTED) {
          throw new ConflictException(
            'This probation record already has a pending evaluation',
          );
        }
        const sequenceNumber = (previous?.sequenceNumber ?? 0) + 1;
        if (sequenceNumber > 65535) {
          throw new ConflictException(
            'The maximum evaluation sequence has been reached',
          );
        }

        const evaluation = repository.create({
          probationRecordId: record.id,
          supervisorId: supervisor.id,
          sequenceNumber,
          scheduledDate: dto.scheduledDate,
          status: EvaluationStatus.SCHEDULED,
          workQuality: null,
          productivity: null,
          attendance: null,
          punctuality: null,
          communication: null,
          teamwork: null,
          initiative: null,
          overallScore: null,
          comments: null,
          recommendation: null,
          submittedAt: null,
        });
        const saved = await repository.save(evaluation);
        record.status = ProbationStatus.FOR_EVALUATION;
        await manager.getRepository(ProbationRecord).save(record);
        return saved;
      },
    );
  }

  async findAll(actor: AuthenticatedUser): Promise<Evaluation[]> {
    return this.evaluationsRepository.find({
      where: this.scope(actor),
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number, actor: AuthenticatedUser): Promise<Evaluation> {
    const evaluation = await this.evaluationsRepository.findOne({
      where: { ...this.scope(actor), id },
    });
    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }
    return evaluation;
  }

  async update(
    id: number,
    dto: UpdateEvaluationDto,
    actor: AuthenticatedUser,
  ): Promise<Evaluation> {
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException(
        'Provide at least one score, comment, or recommendation',
      );
    }
    return this.mutate(id, actor, async (manager, evaluation) => {
      Object.assign(evaluation, changes);
      evaluation.status = EvaluationStatus.DRAFT;
      return manager.getRepository(Evaluation).save(evaluation);
    });
  }

  async submit(id: number, actor: AuthenticatedUser): Promise<Evaluation> {
    return this.mutate(id, actor, async (manager, evaluation, record) => {
      const scores = [
        evaluation.workQuality,
        evaluation.productivity,
        evaluation.attendance,
        evaluation.punctuality,
        evaluation.communication,
        evaluation.teamwork,
        evaluation.initiative,
      ];
      if (
        scores.some(
          (score) =>
            typeof score !== 'number' ||
            !Number.isInteger(score) ||
            score < 1 ||
            score > 5,
        )
      ) {
        throw new BadRequestException(
          'Complete all seven scores using whole numbers from 1 to 5',
        );
      }
      if (
        !evaluation.recommendation ||
        !Object.values(Recommendation).includes(evaluation.recommendation)
      ) {
        throw new BadRequestException(
          'Select a recommendation before submitting',
        );
      }

      evaluation.overallScore = (
        scores.reduce<number>((sum, score) => sum + (score ?? 0), 0) /
        scores.length
      ).toFixed(2);
      evaluation.status = EvaluationStatus.SUBMITTED;
      evaluation.submittedAt = new Date();
      const saved = await manager.getRepository(Evaluation).save(evaluation);
      record.status = ProbationStatus.FOR_HR_REVIEW;
      await manager.getRepository(ProbationRecord).save(record);
      return saved;
    });
  }

  private scope(actor: AuthenticatedUser): FindOptionsWhere<Evaluation> {
    if (actor.role === UserRole.HR_ADMIN) return {};
    if (actor.role === UserRole.SUPERVISOR) {
      return { supervisor: { userId: Number(actor.id), isActive: true } };
    }
    if (actor.role === UserRole.EMPLOYEE) {
      return {
        status: EvaluationStatus.SUBMITTED,
        probationRecord: { employee: { userId: Number(actor.id) } },
      };
    }
    throw new ForbiddenException('Your role cannot access evaluations');
  }

  private async mutate(
    id: number,
    actor: AuthenticatedUser,
    action: (
      manager: EntityManager,
      evaluation: Evaluation,
      record: ProbationRecord,
    ) => Promise<Evaluation>,
  ): Promise<Evaluation> {
    if (actor.role !== UserRole.SUPERVISOR) {
      throw new ForbiddenException(
        'Only the assigned supervisor can evaluate an employee',
      );
    }
    const snapshot = await this.findOne(id, actor);
    return this.withLockedProbation(
      snapshot.probationRecordId,
      async (manager, record) => {
        const evaluation = await manager.getRepository(Evaluation).findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!evaluation) throw new NotFoundException('Evaluation not found');
        if (evaluation.status === EvaluationStatus.SUBMITTED) {
          throw new ConflictException(
            'Submitted evaluations cannot be edited or resubmitted',
          );
        }
        if (record.status !== ProbationStatus.FOR_EVALUATION) {
          throw new ConflictException(
            'The probation record is not awaiting an evaluation',
          );
        }
        const supervisor = await manager.getRepository(Employee).findOne({
          where: { id: evaluation.supervisorId },
        });
        if (!supervisor?.isActive || String(supervisor.userId) !== actor.id) {
          throw new ForbiddenException(
            'Only the assigned active supervisor can evaluate this employee',
          );
        }
        return action(manager, evaluation, record);
      },
    );
  }

  private async withLockedProbation(
    id: number,
    action: (
      manager: EntityManager,
      record: ProbationRecord,
      employee: Employee,
    ) => Promise<Evaluation>,
  ): Promise<Evaluation> {
    const snapshot = await this.recordsRepository.findOne({ where: { id } });
    if (!snapshot) throw new NotFoundException('Probation record not found');
    return this.dataSource.transaction(async (manager) => {
      // Keep the same employee -> probation -> evaluation lock order as the probation module.
      const employee = await manager.getRepository(Employee).findOne({
        where: { id: snapshot.employeeId },
        lock: { mode: 'pessimistic_write' },
      });
      const record = await manager.getRepository(ProbationRecord).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!record) throw new NotFoundException('Probation record not found');
      if (!record.isActive || record.status === ProbationStatus.COMPLETED) {
        throw new ConflictException(
          'This probation record is inactive or completed',
        );
      }
      if (
        !employee?.isActive ||
        employee.employmentStatus !== EmploymentStatus.PROBATIONARY
      ) {
        throw new BadRequestException(
          'The employee must be active and probationary',
        );
      }
      return action(manager, record, employee);
    });
  }
}
