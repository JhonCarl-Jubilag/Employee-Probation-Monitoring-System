import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Evaluation } from '../../evaluations/entities/evaluation.entity';
import { ProbationRecord } from '../../probation-records/entities/probation-record.entity';
import { User } from '../../users/entities/user.entity';

export enum DecisionType {
  REGULARIZED = 'REGULARIZED',
  EXTENDED = 'EXTENDED',
  NOT_REGULARIZED = 'NOT_REGULARIZED',
}

@Entity({ name: 'regularization_decisions' })
@Index('uq_decisions_evaluation_id', ['evaluationId'], {
  unique: true,
})
@Index('idx_decisions_probation_date', ['probationRecordId', 'decisionDate'])
export class RegularizationDecision {
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
    name: 'evaluation_id',
    type: 'bigint',
    unsigned: true,
    unique: true,
  })
  evaluationId!: number;

  @OneToOne(() => Evaluation, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'evaluation_id' })
  evaluation!: Evaluation;

  @Column({
    name: 'decided_by_user_id',
    type: 'bigint',
    unsigned: true,
  })
  decidedByUserId!: number;

  @ManyToOne(() => User, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedBy!: User;

  @Column({
    type: 'enum',
    enum: DecisionType,
  })
  decision!: DecisionType;

  @Column({
    name: 'decision_date',
    type: 'date',
  })
  decisionDate!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  remarks!: string | null;

  @Column({
    name: 'previous_end_date',
    type: 'date',
    nullable: true,
  })
  previousEndDate!: string | null;

  @Column({
    name: 'new_end_date',
    type: 'date',
    nullable: true,
  })
  newEndDate!: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
  })
  createdAt!: Date;
}
