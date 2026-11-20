import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { getRepositoryToken } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { QueryFailedError } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module';
import { EmployeesController } from '../src/employees/employees.controller';
import { EmployeesService } from '../src/employees/employees.service';
import { User, UserRole } from '../src/users/entities/user.entity';
import { UsersModule } from '../src/users/users.module';

// Synthetic accounts and a signing key used only by this isolated test app.
// These tests never load .env, connect to MySQL, or create real accounts.
const TEST_SECRET = 'test-only-signing-key-not-used-by-the-application';
const TEST_PASSWORD = 'test-only-password';

interface LoginQuery {
  addSelect(selection: string): LoginQuery;
  where(sql: string, parameters: { email: string }): LoginQuery;
  getOne(): Promise<User | null>;
}

describe('Authentication and Employee permissions (HTTP)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let accounts: User[];
  let passwordHash: string;

  const employeeService = {
    findAll: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve({})),
    create: jest.fn(() => Promise.resolve({})),
    update: jest.fn(() => Promise.resolve({})),
    deactivate: jest.fn(() => Promise.resolve({})),
  };

  const usersRepository = {
    findOne: ({ where }: { where: { id: number } }) =>
      Promise.resolve(
        accounts.some((user) => user.id === where.id)
          ? Object.assign(
              new User(),
              accounts.find((user) => user.id === where.id),
            )
          : null,
      ),
    find: () =>
      Promise.resolve(
        [...accounts]
          .sort((left, right) => right.id - left.id)
          .map((user) => Object.assign(new User(), user)),
      ),
    create: (values: Partial<User>) => Object.assign(new User(), values),
    save: (user: User): Promise<User> => {
      if (
        accounts.some(
          (account) => account.email === user.email && account.id !== user.id,
        )
      ) {
        return Promise.reject(
          new QueryFailedError(
            'test-only insert',
            [],
            Object.assign(new Error('Duplicate test email'), {
              code: 'ER_DUP_ENTRY',
            }),
          ),
        );
      }
      const saved = Object.assign(new User(), user, {
        id: user.id ?? Math.max(...accounts.map((account) => account.id)) + 1,
        createdAt: user.createdAt ?? new Date(),
        updatedAt: new Date(),
      });
      const index = accounts.findIndex((account) => account.id === saved.id);
      if (index === -1) {
        accounts.push(Object.assign(new User(), saved));
      } else {
        accounts[index] = Object.assign(new User(), saved);
      }
      return Promise.resolve(Object.assign(new User(), saved));
    },
    createQueryBuilder: (): LoginQuery => {
      let email = '';
      const builder: LoginQuery = {
        addSelect: () => builder,
        where: (_sql, parameters) => {
          email = parameters.email;
          return builder;
        },
        getOne: () =>
          Promise.resolve(
            accounts.find((user) => user.email === email) ?? null,
          ),
      };
      return builder;
    },
  };

  beforeAll(async () => {
    passwordHash = await hash(TEST_PASSWORD, 4);

    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: TEST_SECRET })],
        }),
        AuthModule,
        UsersModule,
      ],
      controllers: [EmployeesController],
      providers: [{ provide: EmployeesService, useValue: employeeService }],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(usersRepository)
      .compile();

    app = fixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = app.get(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    accounts = Object.values(UserRole).map((role, index) =>
      Object.assign(new User(), {
        id: index + 1,
        email: `${role.toLowerCase()}@example.test`,
        passwordHash,
        role,
        isActive: true,
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  async function loginAs(role: UserRole): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: `${role.toLowerCase()}@example.test`,
        password: TEST_PASSWORD,
      })
      .expect(200);

    const body = response.body as { access_token: string };
    expect(typeof body.access_token).toBe('string');
    expect(response.body).not.toHaveProperty('user.passwordHash');
    return body.access_token;
  }

  it('keeps login public but validates its request body', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'invalid-email', password: '' })
      .expect(400);
  });

  it.each(['wrong-password', TEST_PASSWORD])(
    'rejects wrong credentials without revealing which field failed (%s)',
    async (password) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email:
            password === TEST_PASSWORD
              ? 'missing@example.test'
              : 'hr_admin@example.test',
          password,
        })
        .expect(401);
      expect(response.body).toHaveProperty(
        'message',
        'Invalid email or password',
      );
    },
  );

  it('rejects requests without a token', async () => {
    await request(app.getHttpServer()).get('/api/employees').expect(401);
  });

  it.each(['Bearer invalid-token', 'Basic abc', 'Bearer abc extra'])(
    'rejects invalid authorization: %s',
    async (authorization) => {
      await request(app.getHttpServer())
        .get('/api/employees')
        .set('Authorization', authorization)
        .expect(401);
    },
  );

  it('rejects an expired token', async () => {
    const token = await jwt.signAsync({ sub: '1' }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/api/employees')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });

  it('rejects a token signed with a different key', async () => {
    const token = await jwt.signAsync(
      { sub: '1' },
      { secret: 'a-different-test-only-signing-key' },
    );
    await request(app.getHttpServer())
      .get('/api/employees')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });

  it.each(Object.values(UserRole))(
    'allows %s to log in and view their own account',
    async (role) => {
      const token = await loginAs(role);
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(response.body).toEqual({
        id: String(accounts.find((user) => user.role === role)!.id),
        email: `${role.toLowerCase()}@example.test`,
        role,
      });
    },
  );

  it('allows an HR administrator to list employees', async () => {
    const token = await loginAs(UserRole.HR_ADMIN);
    await request(app.getHttpServer())
      .get('/api/employees')
      .auth(token, { type: 'bearer' })
      .expect(200)
      .expect([]);
    expect(employeeService.findAll).toHaveBeenCalledTimes(1);
  });

  describe.each([UserRole.SUPERVISOR, UserRole.EMPLOYEE])(
    '%s restrictions',
    (role) => {
      const routes: {
        method: 'get' | 'post' | 'patch' | 'delete';
        path: string;
      }[] = [
        { method: 'get', path: '/api/employees' },
        { method: 'get', path: '/api/employees/1' },
        { method: 'post', path: '/api/employees' },
        { method: 'patch', path: '/api/employees/1' },
        { method: 'delete', path: '/api/employees/1' },
        { method: 'get', path: '/api/users' },
        { method: 'get', path: '/api/users/1' },
        { method: 'post', path: '/api/users' },
        { method: 'patch', path: '/api/users/1' },
        { method: 'delete', path: '/api/users/1' },
      ];

      it.each(routes)('forbids $method $path', async ({ method, path }) => {
        const token = await loginAs(role);
        await request(app.getHttpServer())
          [method](path)
          .auth(token, { type: 'bearer' })
          .expect(403);
        for (const handler of Object.values(employeeService)) {
          expect(handler).not.toHaveBeenCalled();
        }
      });
    },
  );

  it('rejects login and old tokens after an account is deactivated', async () => {
    const token = await loginAs(UserRole.HR_ADMIN);
    accounts[0].isActive = false;

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: accounts[0].email, password: TEST_PASSWORD })
      .expect(401);
  });

  it('uses the current database role rather than a stale role in the token', async () => {
    const token = await loginAs(UserRole.HR_ADMIN);
    accounts[0].role = UserRole.EMPLOYEE;
    await request(app.getHttpServer())
      .get('/api/employees')
      .auth(token, { type: 'bearer' })
      .expect(403);
    expect(employeeService.findAll).not.toHaveBeenCalled();
  });

  describe('HR user account management', () => {
    const newAccount = {
      email: 'new.supervisor@example.test',
      password: 'test-only-new-account-password',
      role: UserRole.SUPERVISOR,
    };

    it('requires authentication to create accounts', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .send(newAccount)
        .expect(401);
      expect(accounts).toHaveLength(3);
    });

    it('creates a login account with a hashed password and a normalized email', async () => {
      const token = await loginAs(UserRole.HR_ADMIN);
      const response = await request(app.getHttpServer())
        .post('/api/users')
        .auth(token, { type: 'bearer' })
        .send({ ...newAccount, email: '  New.Supervisor@EXAMPLE.TEST  ' })
        .expect(201);

      expect(response.body).toMatchObject({
        email: newAccount.email,
        role: UserRole.SUPERVISOR,
        isActive: true,
      });
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      const stored = accounts.find((user) => user.email === newAccount.email)!;
      expect(stored.passwordHash).not.toBe(newAccount.password);
      expect(await compare(newAccount.password, stored.passwordHash)).toBe(
        true,
      );

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: newAccount.email, password: newAccount.password })
        .expect(200);
    });

    it('returns a conflict when the normalized email already exists', async () => {
      const token = await loginAs(UserRole.HR_ADMIN);
      await request(app.getHttpServer())
        .post('/api/users')
        .auth(token, { type: 'bearer' })
        .send({ ...newAccount, email: 'HR_ADMIN@EXAMPLE.TEST' })
        .expect(409);
      expect(accounts).toHaveLength(3);
    });

    it.each([
      { ...newAccount, password: 'short' },
      { ...newAccount, password: 'é'.repeat(40) },
      { ...newAccount, role: 'OWNER' },
      { ...newAccount, isActive: false },
    ])('rejects invalid account creation data %#', async (body) => {
      const token = await loginAs(UserRole.HR_ADMIN);
      await request(app.getHttpServer())
        .post('/api/users')
        .auth(token, { type: 'bearer' })
        .send(body)
        .expect(400);
      expect(accounts).toHaveLength(3);
    });

    it('lists and retrieves accounts without exposing password hashes', async () => {
      const token = await loginAs(UserRole.HR_ADMIN);
      const list = await request(app.getHttpServer())
        .get('/api/users')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(list.body).toHaveLength(3);
      expect(JSON.stringify(list.body)).not.toContain('password');

      const detail = await request(app.getHttpServer())
        .get('/api/users/2')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(detail.body).toHaveProperty('id', '2');
      expect(detail.body).not.toHaveProperty('passwordHash');
    });

    it('updates another account and immediately uses its current role', async () => {
      const token = await loginAs(UserRole.HR_ADMIN);
      const supervisorToken = await loginAs(UserRole.SUPERVISOR);
      await request(app.getHttpServer())
        .patch('/api/users/2')
        .auth(token, { type: 'bearer' })
        .send({ role: UserRole.EMPLOYEE })
        .expect(200);
      const profile = await request(app.getHttpServer())
        .get('/api/auth/me')
        .auth(supervisorToken, { type: 'bearer' })
        .expect(200);
      expect(profile.body).toHaveProperty('role', UserRole.EMPLOYEE);
    });

    it('prevents an administrator from changing their own role or deactivating themselves', async () => {
      const token = await loginAs(UserRole.HR_ADMIN);
      await request(app.getHttpServer())
        .patch('/api/users/1')
        .auth(token, { type: 'bearer' })
        .send({ role: UserRole.EMPLOYEE })
        .expect(400);
      await request(app.getHttpServer())
        .delete('/api/users/1')
        .auth(token, { type: 'bearer' })
        .expect(400);
      expect(accounts[0].role).toBe(UserRole.HR_ADMIN);
      expect(accounts[0].isActive).toBe(true);
    });

    it.each([
      {},
      { email: null },
      { role: null },
      { password: 'unexpected-password' },
    ])('rejects invalid account updates %#', async (body) => {
      const token = await loginAs(UserRole.HR_ADMIN);
      await request(app.getHttpServer())
        .patch('/api/users/2')
        .auth(token, { type: 'bearer' })
        .send(body)
        .expect(400);
    });

    it('deactivates an account, preserves its record, and rejects its old token', async () => {
      const token = await loginAs(UserRole.HR_ADMIN);
      const supervisorToken = await loginAs(UserRole.SUPERVISOR);
      const response = await request(app.getHttpServer())
        .delete('/api/users/2')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(response.body).toHaveProperty('isActive', false);
      expect(accounts).toHaveLength(3);

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .auth(supervisorToken, { type: 'bearer' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'supervisor@example.test', password: TEST_PASSWORD })
        .expect(401);
      await request(app.getHttpServer())
        .patch('/api/users/2')
        .auth(token, { type: 'bearer' })
        .send({ email: 'renamed@example.test' })
        .expect(400);
      await request(app.getHttpServer())
        .delete('/api/users/2')
        .auth(token, { type: 'bearer' })
        .expect(200);
    });

    it('distinguishes invalid IDs from missing accounts', async () => {
      const token = await loginAs(UserRole.HR_ADMIN);
      for (const id of ['abc', '0', '9007199254740992']) {
        await request(app.getHttpServer())
          .get(`/api/users/${id}`)
          .auth(token, { type: 'bearer' })
          .expect(400);
      }
      await request(app.getHttpServer())
        .get('/api/users/999')
        .auth(token, { type: 'bearer' })
        .expect(404);
    });
  });
});
