import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Employee } from './entities/employee.entity';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepository: Repository<Employee>,

    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateEmployeeDto): Promise<Employee> {
    await this.validateAssignments(dto);

    const employee = this.employeesRepository.create({
      ...dto,
      employeeNumber: dto.employeeNumber.trim(),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      department: dto.department.trim(),
      position: dto.position.trim(),
    });

    return this.saveEmployee(employee);
  }

  async findAll(): Promise<Employee[]> {
    return this.employeesRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Employee> {
    const employee = await this.employeesRepository.findOne({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async update(id: number, dto: UpdateEmployeeDto): Promise<Employee> {
    const employee = await this.findOne(id);

    if (!employee.isActive) {
      throw new BadRequestException('Inactive employees cannot be updated');
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    await this.validateAssignments(dto, id);

    this.employeesRepository.merge(employee, dto);

    employee.employeeNumber = employee.employeeNumber.trim();
    employee.firstName = employee.firstName.trim();
    employee.lastName = employee.lastName.trim();
    employee.department = employee.department.trim();
    employee.position = employee.position.trim();

    return this.saveEmployee(employee);
  }

  async deactivate(id: number): Promise<Employee> {
    const employee = await this.findOne(id);

    if (!employee.isActive) {
      return employee;
    }

    const activeDirectReports = await this.employeesRepository.count({
      where: {
        supervisorId: id,
        isActive: true,
      },
    });

    if (activeDirectReports > 0) {
      throw new ConflictException(
        'Reassign active direct reports before deactivating this employee',
      );
    }

    employee.isActive = false;

    return this.saveEmployee(employee);
  }

  private async validateAssignments(
    dto: UpdateEmployeeDto,
    employeeId?: number,
  ): Promise<void> {
    if (dto.userId !== undefined && dto.userId !== null) {
      const user = await this.usersRepository.findOne({
        where: { id: dto.userId },
      });

      if (!user || !user.isActive) {
        throw new BadRequestException(
          'The selected user account does not exist or is inactive',
        );
      }
    }

    if (dto.supervisorId !== undefined && dto.supervisorId !== null) {
      await this.validateSupervisor(dto.supervisorId, employeeId);
    }
  }

  private async validateSupervisor(
    supervisorId: number,
    employeeId?: number,
  ): Promise<void> {
    const supervisor = await this.employeesRepository.findOne({
      where: { id: supervisorId },
    });

    if (!supervisor || !supervisor.isActive) {
      throw new BadRequestException(
        'The selected supervisor does not exist or is inactive',
      );
    }

    // Follow the supervisor chain to prevent circular reporting.
    const visited = new Set<string>();

    let current: Employee | null = supervisor;

    while (current) {
      const currentId = String(current.id);

      if (employeeId !== undefined && currentId === String(employeeId)) {
        throw new BadRequestException(
          'An employee cannot supervise themselves or report to their own subordinate',
        );
      }

      if (visited.has(currentId)) {
        throw new BadRequestException(
          'The selected supervisor belongs to a circular reporting chain',
        );
      }

      visited.add(currentId);

      if (current.supervisorId === null) {
        break;
      }

      current = await this.employeesRepository.findOne({
        where: { id: current.supervisorId },
      });
    }
  }

  private async saveEmployee(employee: Employee): Promise<Employee> {
    try {
      return await this.employeesRepository.save(employee);
    } catch (error: unknown) {
      if (error instanceof QueryFailedError) {
        const driverError: unknown = error.driverError;

        if (
          typeof driverError === 'object' &&
          driverError !== null &&
          'code' in driverError
        ) {
          const code: unknown = driverError.code;

          if (code === 'ER_DUP_ENTRY') {
            throw new ConflictException(
              'The employee number or user account is already assigned to an employee',
            );
          }

          if (code === 'ER_NO_REFERENCED_ROW_2') {
            throw new BadRequestException(
              'The selected user account or supervisor no longer exists',
            );
          }
        }
      }

      throw error;
    }
  }
}
