import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { User } from '../../users/entities/user.entity';

export enum ProbationStatus {
  UNDER_PROBATION = 'UNDER_PROBATION',
  FOR_EVALUATION = 'FOR_EVALUATION',
  FOR_HR_REVIEW = 'FOR_HR_REVIEW',
  COMPLETED = 'COMPLETED',
}

@Entity({ name: 'probation_records' })
@Index('idx_probation_employee_active', ['employeeId', 'isActive'])
@Index('idx_probation_deadline_status', ['expectedEndDate', 'status'])
export class ProbationRecord {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    unsigned: true,
  })
  id!: number;

  @Column({
    name: 'employee_id',
    type: 'bigint',
    unsigned: true,
  })
  employeeId!: number;

  @ManyToOne(() => Employee, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({
    name: 'created_by_user_id',
    type: 'bigint',
    unsigned: true,
  })
  createdByUserId!: number;

  @ManyToOne(() => User, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy!: User;

  @Column({
    name: 'start_date',
    type: 'date',
  })
  startDate!: string;

  @Column({
    name: 'expected_end_date',
    type: 'date',
  })
  expectedEndDate!: string;

  @Column({
    type: 'enum',
    enum: ProbationStatus,
    default: ProbationStatus.UNDER_PROBATION,
  })
  status!: ProbationStatus;

  @Column({
    name: 'is_active',
    type: 'boolean',
    default: true,
  })
  isActive!: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
  })
  updatedAt!: Date;
}
