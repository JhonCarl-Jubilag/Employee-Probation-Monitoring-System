import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { ProbationRecord } from '../../probation-records/entities/probation-record.entity';

export enum EvaluationStatus {
  SCHEDULED = 'SCHEDULED',
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
}

export enum Recommendation {
  REGULARIZE = 'REGULARIZE',
  EXTEND = 'EXTEND',
  DO_NOT_REGULARIZE = 'DO_NOT_REGULARIZE',
}

@Entity({ name: 'evaluations' })
@Unique('uq_evaluations_probation_sequence', [
  'probationRecordId',
  'sequenceNumber',
])
@Index('idx_evaluations_supervisor_queue', [
  'supervisorId',
  'status',
  'scheduledDate',
])
export class Evaluation {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    unsigned: true,
  })
  id!: number;

  @Column({
    name: 'probation_record_id',
    type: 'bigint',
    unsigned: true,
  })
  probationRecordId!: number;

  @ManyToOne(() => ProbationRecord, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'probation_record_id' })
  probationRecord!: ProbationRecord;

  @Column({
    name: 'supervisor_id',
    type: 'bigint',
    unsigned: true,
  })
  supervisorId!: number;

  @ManyToOne(() => Employee, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor!: Employee;

  @Column({
    name: 'sequence_number',
    type: 'smallint',
    unsigned: true,
  })
  sequenceNumber!: number;

  @Column({
    name: 'scheduled_date',
    type: 'date',
  })
  scheduledDate!: string;

  @Column({
    type: 'enum',
    enum: EvaluationStatus,
    default: EvaluationStatus.SCHEDULED,
  })
  status!: EvaluationStatus;

  @Column({
    name: 'work_quality',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  workQuality!: number | null;

  @Column({
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  productivity!: number | null;

  @Column({
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  attendance!: number | null;

  @Column({
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  punctuality!: number | null;

  @Column({
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  communication!: number | null;

  @Column({
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  teamwork!: number | null;

  @Column({
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  initiative!: number | null;

  @Column({
    name: 'overall_score',
    type: 'decimal',
    precision: 3,
    scale: 2,
    nullable: true,
  })
  overallScore!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  comments!: string | null;

  @Column({
    type: 'enum',
    enum: Recommendation,
    nullable: true,
  })
  recommendation!: Recommendation | null;

  @Column({
    name: 'submitted_at',
    type: 'datetime',
    nullable: true,
  })
  submittedAt!: Date | null;

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
