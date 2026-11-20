import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Employee,
  EmploymentStatus,
} from '../employees/entities/employee.entity';
import { Evaluation } from '../evaluations/entities/evaluation.entity';
import { RegularizationDecision } from '../regularization-decisions/entities/regularization-decision.entity';
import { CreateProbationRecordDto } from './dto/create-probation-record.dto';
import { UpdateProbationRecordDto } from './dto/update-probation-record.dto';
import {
  ProbationRecord,
  ProbationStatus,
} from './entities/probation-record.entity';

@Injectable()
export class ProbationRecordsService {
  constructor(
    @InjectRepository(ProbationRecord)
    private readonly recordsRepository: Repository<ProbationRecord>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateProbationRecordDto,
    actingUserId: string,
  ): Promise<ProbationRecord> {
    return this.dataSource.transaction(async (manager) => {
      // Every probation mutation locks employee first, then probation record.
      // This serializes creation for one employee without changing the schema.
      const employee = await this.lockEmployee(manager, dto.employeeId);
      this.validateEmployee(employee);
      this.validateDates(
        dto.startDate,
        dto.expectedEndDate,
        employee.dateHired,
      );

      const repository = manager.getRepository(ProbationRecord);
      const existing = await repository.findOne({
        where: { employeeId: dto.employeeId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) {
        throw new ConflictException(
          'This employee already has an active probation record',
        );
      }

      const record = repository.create({
        employeeId: dto.employeeId,
        createdByUserId: Number(actingUserId),
        startDate: dto.startDate,
        expectedEndDate: dto.expectedEndDate,
        status: ProbationStatus.UNDER_PROBATION,
        isActive: true,
      });
      return repository.save(record);
    });
  }

  async findAll(): Promise<ProbationRecord[]> {
    return this.recordsRepository.find({ order: { id: 'DESC' } });
  }

  async findOne(id: number): Promise<ProbationRecord> {
    const record = await this.recordsRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('Probation record not found');
    }
    return record;
  }

  async update(
    id: number,
    dto: UpdateProbationRecordDto,
  ): Promise<ProbationRecord> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one date to update');
    }

    return this.mutate(id, async (manager, record, employee) => {
      await this.ensureEditable(manager, record);
      this.validateEmployee(employee);

      const startDate = dto.startDate ?? record.startDate;
      const expectedEndDate = dto.expectedEndDate ?? record.expectedEndDate;
      this.validateDates(startDate, expectedEndDate, employee.dateHired);

      record.startDate = startDate;
      record.expectedEndDate = expectedEndDate;
      return manager.getRepository(ProbationRecord).save(record);
    });
  }

  async deactivate(id: number): Promise<ProbationRecord> {
    return this.mutate(id, async (manager, record) => {
      if (!record.isActive) {
        return record;
      }
      await this.ensureEditable(manager, record);
      record.isActive = false;
      return manager.getRepository(ProbationRecord).save(record);
    });
  }

  private async mutate(
    id: number,
    action: (
      manager: EntityManager,
      record: ProbationRecord,
      employee: Employee,
    ) => Promise<ProbationRecord>,
  ): Promise<ProbationRecord> {
    // Read the immutable employee ID before the transaction so all mutations
    // can acquire their locks in the same order.
    const snapshot = await this.findOne(id);
    return this.dataSource.transaction(async (manager) => {
      const employee = await this.lockEmployee(manager, snapshot.employeeId);
      const record = await manager.getRepository(ProbationRecord).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!record) {
        throw new NotFoundException('Probation record not found');
      }
      return action(manager, record, employee);
    });
  }

  private async lockEmployee(
    manager: EntityManager,
    employeeId: number,
  ): Promise<Employee> {
    const employee = await manager.getRepository(Employee).findOne({
      where: { id: employeeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!employee) {
      throw new BadRequestException('The selected employee does not exist');
    }
    return employee;
  }

  private validateEmployee(employee: Employee): void {
    if (
      !employee.isActive ||
      employee.employmentStatus !== EmploymentStatus.PROBATIONARY
    ) {
      throw new BadRequestException(
        'Select an active employee with PROBATIONARY employment status',
      );
    }
  }

  private validateDates(start: string, end: string, hired: string): void {
    if (start < hired) {
      throw new BadRequestException(
        'Probation cannot start before the employee hire date',
      );
    }
    if (end <= start) {
      throw new BadRequestException(
        'Expected end date must be after start date',
      );
    }
  }

  private async ensureEditable(
    manager: EntityManager,
    record: ProbationRecord,
  ): Promise<void> {
    if (!record.isActive) {
      throw new ConflictException(
        'Inactive probation records cannot be updated',
      );
    }
    if (record.status !== ProbationStatus.UNDER_PROBATION) {
      throw new ConflictException(
        'This probation record has entered the evaluation or decision workflow',
      );
    }

    const evaluations = await manager.getRepository(Evaluation).count({
      where: { probationRecordId: record.id },
    });
    const decisions = await manager
      .getRepository(RegularizationDecision)
      .count({
        where: { probationRecordId: record.id },
      });
    if (evaluations > 0 || decisions > 0) {
      throw new ConflictException(
        'Records with evaluations or decisions must be changed through their workflow',
      );
    }
  }
}
