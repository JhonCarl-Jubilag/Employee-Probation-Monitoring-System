import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,

    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('A login token is required');
    }

    const [scheme, token, ...extra] = authorization.trim().split(/\s+/);

    if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0) {
      throw new UnauthorizedException(
        'Use Bearer followed by your login token',
      );
    }

    let payload: Record<string, unknown>;

    try {
      payload =
        await this.jwtService.verifyAsync<Record<string, unknown>>(token);
    } catch {
      throw new UnauthorizedException('The login token is invalid or expired');
    }

    const subject =
      payload && typeof payload === 'object' ? payload.sub : undefined;

    if (
      typeof subject !== 'string' ||
      !/^[1-9]\d*$/.test(subject) ||
      !Number.isSafeInteger(Number(subject))
    ) {
      throw new UnauthorizedException('Invalid token user ID');
    }

    const user = await this.usersRepository.findOne({
      where: { id: Number(subject) },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('The account is unavailable or inactive');
    }

    request.user = {
      id: String(user.id),
      email: user.email,
      role: user.role,
    };

    return true;
  }
}
