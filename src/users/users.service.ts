import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';

export interface UserResponse {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponse> {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('Password must not exceed 72 bytes');
    }

    const user = this.usersRepository.create({
      email: dto.email.trim().toLowerCase(),
      passwordHash: await hash(dto.password, 12),
      role: dto.role,
      isActive: true,
    });

    return this.toResponse(await this.save(user));
  }

  async findAll(): Promise<UserResponse[]> {
    const users = await this.usersRepository.find({ order: { id: 'DESC' } });
    return users.map((user) => this.toResponse(user));
  }

  async findOne(id: number): Promise<UserResponse> {
    return this.toResponse(await this.findEntity(id));
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    actingUserId: string,
  ): Promise<UserResponse> {
    const user = await this.findEntity(id);

    if (!user.isActive) {
      throw new BadRequestException('Inactive accounts cannot be updated');
    }
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }
    if (
      String(user.id) === actingUserId &&
      dto.role !== undefined &&
      dto.role !== user.role
    ) {
      throw new BadRequestException('You cannot change your own account role');
    }

    if (dto.email !== undefined) {
      user.email = dto.email.trim().toLowerCase();
    }
    if (dto.role !== undefined) {
      user.role = dto.role;
    }

    return this.toResponse(await this.save(user));
  }

  async deactivate(id: number, actingUserId: string): Promise<UserResponse> {
    const user = await this.findEntity(id);

    if (String(user.id) === actingUserId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (!user.isActive) {
      return this.toResponse(user);
    }

    user.isActive = false;
    return this.toResponse(await this.save(user));
  }

  private async findEntity(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User account not found');
    }
    return user;
  }

  private toResponse(user: User): UserResponse {
    // Explicit fields keep hashes out of responses, including immediately after saving.
    return {
      id: String(user.id),
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async save(user: User): Promise<User> {
    try {
      return await this.usersRepository.save(user);
    } catch (error: unknown) {
      if (error instanceof QueryFailedError) {
        const driverError: unknown = error.driverError;
        if (
          typeof driverError === 'object' &&
          driverError !== null &&
          'code' in driverError &&
          driverError.code === 'ER_DUP_ENTRY'
        ) {
          throw new ConflictException('This email already has a user account');
        }
      }
      throw error;
    }
  }
}
