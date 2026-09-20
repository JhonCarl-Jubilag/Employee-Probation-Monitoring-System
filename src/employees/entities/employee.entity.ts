import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum EmploymentStatus {
  PROBATIONARY = 'PROBATIONARY',
  REGULAR = 'REGULAR',
  SEPARATED = 'SEPARATED',
}

@Entity({ name: 'employees' })
export class Employee {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    unsigned: true,
  })
  id!: number;

  @Column({
    name: 'employee_number',
    type: 'varchar',
    length: 30,
    unique: true,
  })
  employeeNumber!: string;

  @Column({
    name: 'user_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    unique: true,
  })
  userId!: number | null;

  @OneToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({
    name: 'supervisor_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
  })
  supervisorId!: number | null;

  @ManyToOne(() => Employee, (employee) => employee.directReports, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor!: Employee | null;

  @OneToMany(() => Employee, (employee) => employee.supervisor)
  directReports!: Employee[];

  @Column({
    name: 'first_name',
    type: 'varchar',
    length: 100,
  })
  firstName!: string;

  @Column({
    name: 'last_name',
    type: 'varchar',
    length: 100,
  })
  lastName!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  department!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  position!: string;

  @Column({
    name: 'date_hired',
    type: 'date',
  })
  dateHired!: string;

  @Column({
    name: 'employment_status',
    type: 'enum',
    enum: EmploymentStatus,
    default: EmploymentStatus.PROBATIONARY,
  })
  employmentStatus!: EmploymentStatus;

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
