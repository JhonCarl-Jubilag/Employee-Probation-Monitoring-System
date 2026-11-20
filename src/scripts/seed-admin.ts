import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { hash } from 'bcryptjs';
import { isEmail } from 'class-validator';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { User, UserRole } from '../users/entities/user.entity';

async function seedAdmin(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const configService = app.get(ConfigService);

    const email = configService
      .getOrThrow<string>('SEED_ADMIN_EMAIL')
      .trim()
      .toLowerCase();

    const password = configService.getOrThrow<string>('SEED_ADMIN_PASSWORD');

    if (!isEmail(email) || email.length > 255) {
      throw new Error('Provide a valid administrator email');
    }

    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error(
        'Administrator password must contain at least 12 characters and not exceed 72 bytes',
      );
    }

    const usersRepository = app.get(DataSource).getRepository(User);

    const existingUser = await usersRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new Error(
        'This email already has an account. No changes were made.',
      );
    }

    const passwordHash = await hash(password, 12);

    const admin = usersRepository.create({
      email,
      passwordHash,
      role: UserRole.HR_ADMIN,
      isActive: true,
    });

    await usersRepository.save(admin);

    console.log('HR administrator account created successfully.');
  } finally {
    await app.close();
  }
}

seedAdmin().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Administrator account setup failed',
  );

  process.exitCode = 1;
});
