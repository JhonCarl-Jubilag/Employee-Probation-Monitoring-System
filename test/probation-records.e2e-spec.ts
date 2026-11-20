import { Global, Module, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { jest } from '@jest/globals';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { AuthModule } from '../src/auth/auth.module';
import {
  Employee,
  EmploymentStatus,
} from '../src/employees/entities/employee.entity';
import { Evaluation } from '../src/evaluations/entities/evaluation.entity';
import {
  ProbationRecord,
  ProbationStatus,
} from '../src/probation-records/entities/probation-record.entity';
import { ProbationRecordsModule } from '../src/probation-records/probation-records.module';
import { RegularizationDecision } from '../src/regularization-decisions/entities/regularization-decision.entity';
import { User, UserRole } from '../src/users/entities/user.entity';

// The test application substitutes in-memory repositories and transactions.
// It does not read .env, start a MySQL connection, or modify real records.
describe('Probation record management (HTTP)', () => {
  let app: INestApplication<App>;
  let records: ProbationRecord[];
  let employees: Employee[];
  let evaluationCount: number;
  let decisionCount: number;
  let nextId: number;
  let tokens: Record<UserRole, string>;

  const validRecord = {
    employeeId: 1,
    startDate: '2026-11-20',
    expectedEndDate: '2027-05-20',
  };

  const employeeRepository = {
    findOne: ({ where }: { where: { id: number } }) =>
      Promise.resolve(
        employees.find((employee) => employee.id === where.id) ?? null,
      ),
  };

  const recordsRepository = {
    find: () =>
      Promise.resolve(
        [...records]
          .reverse()
          .map((record) => Object.assign(new ProbationRecord(), record)),
      ),
    findOne: ({ where }: { where: Partial<ProbationRecord> }) => {
      const record = records.find(
        (item) =>
          (where.id === undefined || item.id === where.id) &&
          (where.employeeId === undefined ||
            item.employeeId === where.employeeId) &&
          (where.isActive === undefined || item.isActive === where.isActive),
      );
      return Promise.resolve(
        record ? Object.assign(new ProbationRecord(), record) : null,
      );
    },
    create: (values: Partial<ProbationRecord>) =>
      Object.assign(new ProbationRecord(), values),
    save: (record: ProbationRecord) => {
      const saved = Object.assign(new ProbationRecord(), record, {
        id: record.id ?? nextId++,
        createdAt: record.createdAt ?? new Date(),
        updatedAt: new Date(),
      });
      const index = records.findIndex((item) => item.id === saved.id);
      if (index === -1) records.push(saved);
      else records[index] = saved;
      return Promise.resolve(Object.assign(new ProbationRecord(), saved));
    },
  };

  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === Employee) return employeeRepository;
      if (entity === ProbationRecord) return recordsRepository;
      if (entity === Evaluation)
        return { count: () => Promise.resolve(evaluationCount) };
      if (entity === RegularizationDecision)
        return { count: () => Promise.resolve(decisionCount) };
      throw new Error('Unexpected test repository');
    },
  } as unknown as EntityManager;

  const testDataSource = {
    async transaction<T>(
      work: (entityManager: EntityManager) => Promise<T>,
    ): Promise<T> {
      const snapshot = records.map((record) =>
        Object.assign(new ProbationRecord(), record),
      );
      try {
        return await work(manager);
      } catch (error: unknown) {
        records = snapshot;
        throw error;
      }
    },
  };

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [{ provide: DataSource, useValue: testDataSource }],
      exports: [DataSource],
    })
    class TestDatabaseModule {}

    const roles = Object.values(UserRole);
    const usersRepository = {
      findOne: ({ where }: { where: { id: number } }) => {
        const role = roles[where.id - 1];
        return Promise.resolve(
          role
            ? Object.assign(new User(), {
                id: where.id,
                email: `${role.toLowerCase()}@example.test`,
                role,
                isActive: true,
              })
            : null,
        );
      },
    };

    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: 'probation-tests-only-secret-not-for-real-use',
            }),
          ],
        }),
        TestDatabaseModule,
        AuthModule,
        ProbationRecordsModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(usersRepository)
      .overrideProvider(getRepositoryToken(ProbationRecord))
      .useValue(recordsRepository)
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
    const jwt = app.get(JwtService);
    tokens = {} as Record<UserRole, string>;
    for (const [index, role] of roles.entries()) {
      tokens[role] = await jwt.signAsync({ sub: String(index + 1), role });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    records = [];
    nextId = 1;
    evaluationCount = 0;
    decisionCount = 0;
    employees = [
      Object.assign(new Employee(), {
        id: 1,
        dateHired: '2026-11-20',
        employmentStatus: EmploymentStatus.PROBATIONARY,
        isActive: true,
      }),
    ];
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createRecord(): Promise<number> {
    const response = await request(app.getHttpServer())
      .post('/api/probation-records')
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .send(validRecord)
      .expect(201);
    return (response.body as { id: number }).id;
  }

  it('creates a probation period with a server-controlled status and creator', async () => {
    await createRecord();
    expect(records[0]).toMatchObject({
      ...validRecord,
      createdByUserId: 1,
      status: ProbationStatus.UNDER_PROBATION,
      isActive: true,
    });
  });

  it('rejects a second active record for the same employee', async () => {
    await createRecord();
    await request(app.getHttpServer())
      .post('/api/probation-records')
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .send(validRecord)
      .expect(409);
    expect(records).toHaveLength(1);
  });

  it.each(['inactive', 'regular', 'separated', 'missing'])(
    'rejects an ineligible employee: %s',
    async (kind) => {
      if (kind === 'inactive') employees[0].isActive = false;
      if (kind === 'regular')
        employees[0].employmentStatus = EmploymentStatus.REGULAR;
      if (kind === 'separated')
        employees[0].employmentStatus = EmploymentStatus.SEPARATED;
      if (kind === 'missing') employees = [];
      await request(app.getHttpServer())
        .post('/api/probation-records')
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .send(validRecord)
        .expect(400);
      expect(records).toHaveLength(0);
    },
  );

  it.each([
    { ...validRecord, startDate: '2026-11-19' },
    { ...validRecord, expectedEndDate: '2026-11-20' },
    { ...validRecord, expectedEndDate: '2026-11-19' },
    { ...validRecord, expectedEndDate: '2027-02-30' },
    { ...validRecord, startDate: '2026-11-20T00:00:00Z' },
    { ...validRecord, startDate: null },
    { ...validRecord, employeeId: '1' },
    { ...validRecord, employeeId: 0 },
    { ...validRecord, createdByUserId: 3 },
    { ...validRecord, status: 'COMPLETED' },
    { ...validRecord, isActive: false },
    { employeeId: 1 },
  ])(
    'rejects invalid or client-controlled creation fields %#',
    async (body) => {
      await request(app.getHttpServer())
        .post('/api/probation-records')
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .send(body)
        .expect(400);
      expect(records).toHaveLength(0);
    },
  );

  it('lists records and retrieves an individual period', async () => {
    const id = await createRecord();
    const list = await request(app.getHttpServer())
      .get('/api/probation-records')
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .expect(200);
    expect(list.body).toHaveLength(1);
    const detail = await request(app.getHttpServer())
      .get(`/api/probation-records/${id}`)
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .expect(200);
    expect(detail.body).toMatchObject(validRecord);
  });

  it('updates one date while preserving the other and the record identity', async () => {
    const id = await createRecord();
    await request(app.getHttpServer())
      .patch(`/api/probation-records/${id}`)
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .send({ expectedEndDate: '2027-06-20' })
      .expect(200);
    expect(records[0]).toMatchObject({
      employeeId: 1,
      createdByUserId: 1,
      startDate: validRecord.startDate,
      expectedEndDate: '2027-06-20',
      status: ProbationStatus.UNDER_PROBATION,
    });
  });

  it.each([
    {},
    { startDate: null },
    { startDate: '2027-06-20' },
    { expectedEndDate: '2026-11-20' },
    { employeeId: 2 },
    { createdByUserId: 2 },
    { status: 'COMPLETED' },
    { isActive: false },
  ])(
    'rejects invalid edits without changing the stored dates %#',
    async (body) => {
      const id = await createRecord();
      await request(app.getHttpServer())
        .patch(`/api/probation-records/${id}`)
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .send(body)
        .expect(400);
      expect(records[0]).toMatchObject(validRecord);
    },
  );

  it.each([
    ProbationStatus.FOR_EVALUATION,
    ProbationStatus.FOR_HR_REVIEW,
    ProbationStatus.COMPLETED,
  ])(
    'blocks ordinary edits and deactivation after status becomes %s',
    async (status) => {
      const id = await createRecord();
      records[0].status = status;
      await request(app.getHttpServer())
        .patch(`/api/probation-records/${id}`)
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .send({ expectedEndDate: '2027-06-20' })
        .expect(409);
      await request(app.getHttpServer())
        .delete(`/api/probation-records/${id}`)
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .expect(409);
      expect(records[0].isActive).toBe(true);
    },
  );

  it.each(['evaluations', 'decisions'])(
    'preserves records that already have %s',
    async (dependency) => {
      const id = await createRecord();
      if (dependency === 'evaluations') evaluationCount = 1;
      else decisionCount = 1;
      await request(app.getHttpServer())
        .patch(`/api/probation-records/${id}`)
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .send({ expectedEndDate: '2027-06-20' })
        .expect(409);
      await request(app.getHttpServer())
        .delete(`/api/probation-records/${id}`)
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .expect(409);
      expect(records[0]).toMatchObject({ ...validRecord, isActive: true });
    },
  );

  it('preserves deactivated records, rejects edits, and permits a later active period', async () => {
    const id = await createRecord();
    for (let attempt = 0; attempt < 2; attempt++) {
      await request(app.getHttpServer())
        .delete(`/api/probation-records/${id}`)
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .expect(200);
    }
    expect(records).toHaveLength(1);
    const detail = await request(app.getHttpServer())
      .get(`/api/probation-records/${id}`)
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .expect(200);
    expect(detail.body).toHaveProperty('isActive', false);
    await request(app.getHttpServer())
      .patch(`/api/probation-records/${id}`)
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .send({ expectedEndDate: '2027-06-20' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/probation-records')
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .send({
        ...validRecord,
        startDate: '2027-06-01',
        expectedEndDate: '2027-12-01',
      })
      .expect(201);
    expect(records).toHaveLength(2);
    expect(records.filter((record) => record.isActive)).toHaveLength(1);
  });

  it('rejects date updates if the employee becomes inactive', async () => {
    const id = await createRecord();
    employees[0].isActive = false;
    await request(app.getHttpServer())
      .patch(`/api/probation-records/${id}`)
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .send({ expectedEndDate: '2027-06-20' })
      .expect(400);
  });

  it('validates IDs and returns 404 for a missing record', async () => {
    for (const id of ['abc', '0', '-1', '9007199254740992']) {
      await request(app.getHttpServer())
        .get(`/api/probation-records/${id}`)
        .auth(tokens.HR_ADMIN, { type: 'bearer' })
        .expect(400);
    }
    await request(app.getHttpServer())
      .get('/api/probation-records/999')
      .auth(tokens.HR_ADMIN, { type: 'bearer' })
      .expect(404);
  });

  const routes: {
    method: 'get' | 'post' | 'patch' | 'delete';
    path: string;
  }[] = [
    { method: 'get', path: '/api/probation-records' },
    { method: 'get', path: '/api/probation-records/1' },
    { method: 'post', path: '/api/probation-records' },
    { method: 'patch', path: '/api/probation-records/1' },
    { method: 'delete', path: '/api/probation-records/1' },
  ];

  it.each(routes)(
    'requires login for $method $path',
    async ({ method, path }) => {
      await request(app.getHttpServer())[method](path).expect(401);
    },
  );

  describe.each([UserRole.SUPERVISOR, UserRole.EMPLOYEE])(
    '%s restrictions',
    (role) => {
      it.each(routes)('forbids $method $path', async ({ method, path }) => {
        await request(app.getHttpServer())
          [method](path)
          .auth(tokens[role], { type: 'bearer' })
          .expect(403);
        expect(records).toHaveLength(0);
      });
    },
  );
});
