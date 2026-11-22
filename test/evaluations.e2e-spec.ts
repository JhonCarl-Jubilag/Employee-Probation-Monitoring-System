import { Global, Module, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { AuthModule } from '../src/auth/auth.module';
import {
  Employee,
  EmploymentStatus,
} from '../src/employees/entities/employee.entity';
import {
  Evaluation,
  EvaluationStatus,
  Recommendation,
} from '../src/evaluations/entities/evaluation.entity';
import { EvaluationsModule } from '../src/evaluations/evaluations.module';
import {
  ProbationRecord,
  ProbationStatus,
} from '../src/probation-records/entities/probation-record.entity';
import { User, UserRole } from '../src/users/entities/user.entity';

interface EvaluationFilter {
  id?: number;
  probationRecordId?: number;
  status?: EvaluationStatus;
  supervisor?: { userId: number; isActive: boolean };
  probationRecord?: { employee: { userId: number } };
}

// These HTTP tests use synthetic accounts and in-memory repositories only.
describe('Evaluation workflow and ownership (HTTP)', () => {
  let app: INestApplication<App>;
  let accounts: User[];
  let employees: Employee[];
  let records: ProbationRecord[];
  let evaluations: Evaluation[];
  let tokens: Record<string, string>;
  let nextId: number;
  let failRecordSave: boolean;

  const completeDraft = {
    workQuality: 5,
    productivity: 4,
    attendance: 4,
    punctuality: 5,
    communication: 4,
    teamwork: 5,
    initiative: 4,
    recommendation: Recommendation.REGULARIZE,
    comments: 'Synthetic evaluation used only by automated tests.',
  };
  const schedule = { probationRecordId: 1, scheduledDate: '2027-05-01' };

  const usersRepository = {
    findOne: ({ where }: { where: { id: number } }) =>
      Promise.resolve(
        accounts.find((account) => account.id === where.id) ?? null,
      ),
  };
  const employeeRepository = {
    findOne: ({ where }: { where: { id: number } }) =>
      Promise.resolve(
        employees.find((employee) => employee.id === where.id) ?? null,
      ),
  };
  const recordsRepository = {
    findOne: ({ where }: { where: { id: number } }) => {
      const record = records.find((item) => item.id === where.id);
      return Promise.resolve(
        record ? Object.assign(new ProbationRecord(), record) : null,
      );
    },
    save: (record: ProbationRecord): Promise<ProbationRecord> => {
      if (failRecordSave)
        return Promise.reject(new Error('Synthetic record-save failure'));
      records[records.findIndex((item) => item.id === record.id)] =
        Object.assign(new ProbationRecord(), record);
      return Promise.resolve(record);
    },
  };

  function matchingEvaluations(where: EvaluationFilter): Evaluation[] {
    return evaluations.filter((evaluation) => {
      if (where.id !== undefined && evaluation.id !== where.id) return false;
      if (
        where.probationRecordId !== undefined &&
        evaluation.probationRecordId !== where.probationRecordId
      )
        return false;
      if (where.status !== undefined && evaluation.status !== where.status)
        return false;
      if (where.supervisor) {
        const supervisor = employees.find(
          (employee) => employee.id === evaluation.supervisorId,
        );
        if (
          supervisor?.userId !== where.supervisor.userId ||
          supervisor?.isActive !== where.supervisor.isActive
        )
          return false;
      }
      if (where.probationRecord) {
        const record = records.find(
          (item) => item.id === evaluation.probationRecordId,
        );
        const employee = employees.find(
          (item) => item.id === record?.employeeId,
        );
        if (employee?.userId !== where.probationRecord.employee.userId)
          return false;
      }
      return true;
    });
  }

  const evaluationsRepository = {
    find: ({ where }: { where: EvaluationFilter }) =>
      Promise.resolve(
        matchingEvaluations(where).map((item) =>
          Object.assign(new Evaluation(), item),
        ),
      ),
    findOne: ({ where }: { where: EvaluationFilter }) => {
      const evaluation = matchingEvaluations(where).sort(
        (left, right) => right.sequenceNumber - left.sequenceNumber,
      )[0];
      return Promise.resolve(
        evaluation ? Object.assign(new Evaluation(), evaluation) : null,
      );
    },
    create: (values: Partial<Evaluation>) =>
      Object.assign(new Evaluation(), values),
    save: (evaluation: Evaluation) => {
      const saved = Object.assign(new Evaluation(), evaluation, {
        id: evaluation.id ?? nextId++,
        createdAt: evaluation.createdAt ?? new Date(),
        updatedAt: new Date(),
      });
      const index = evaluations.findIndex((item) => item.id === saved.id);
      if (index === -1) evaluations.push(saved);
      else evaluations[index] = saved;
      return Promise.resolve(Object.assign(new Evaluation(), saved));
    },
  };

  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === Employee) return employeeRepository;
      if (entity === User) return usersRepository;
      if (entity === ProbationRecord) return recordsRepository;
      if (entity === Evaluation) return evaluationsRepository;
      throw new Error('Unexpected test repository');
    },
  } as unknown as EntityManager;

  const testDataSource = {
    async transaction<T>(
      work: (entityManager: EntityManager) => Promise<T>,
    ): Promise<T> {
      const previousRecords = records.map((record) =>
        Object.assign(new ProbationRecord(), record),
      );
      const previousEvaluations = evaluations.map((evaluation) =>
        Object.assign(new Evaluation(), evaluation),
      );
      try {
        return await work(manager);
      } catch (error: unknown) {
        records = previousRecords;
        evaluations = previousEvaluations;
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

    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: 'evaluation-tests-only-secret-not-for-real-use',
            }),
          ],
        }),
        TestDatabaseModule,
        AuthModule,
        EvaluationsModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(usersRepository)
      .overrideProvider(getRepositoryToken(ProbationRecord))
      .useValue(recordsRepository)
      .overrideProvider(getRepositoryToken(Evaluation))
      .useValue(evaluationsRepository)
      .compile();

    app = fixture.createNestApplication();
    app.useLogger(false);
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
    tokens = {};
    for (const [name, id] of Object.entries({
      hr: 1,
      supervisorA: 2,
      employeeA: 3,
      supervisorB: 4,
      employeeB: 5,
    })) {
      tokens[name] = await jwt.signAsync({ sub: String(id) });
    }
  });

  beforeEach(() => {
    nextId = 1;
    failRecordSave = false;
    evaluations = [];
    accounts = [
      UserRole.HR_ADMIN,
      UserRole.SUPERVISOR,
      UserRole.EMPLOYEE,
      UserRole.SUPERVISOR,
      UserRole.EMPLOYEE,
    ].map((role, index) =>
      Object.assign(new User(), {
        id: index + 1,
        email: `test${index + 1}@example.test`,
        role,
        isActive: true,
      }),
    );
    employees = [
      {
        id: 1,
        userId: 3,
        supervisorId: 2,
        employmentStatus: EmploymentStatus.PROBATIONARY,
      },
      {
        id: 2,
        userId: 2,
        supervisorId: null,
        employmentStatus: EmploymentStatus.REGULAR,
      },
      {
        id: 3,
        userId: 5,
        supervisorId: 4,
        employmentStatus: EmploymentStatus.PROBATIONARY,
      },
      {
        id: 4,
        userId: 4,
        supervisorId: null,
        employmentStatus: EmploymentStatus.REGULAR,
      },
    ].map((values) =>
      Object.assign(new Employee(), values, {
        isActive: true,
        dateHired: '2026-11-20',
      }),
    );
    records = [1, 3].map((employeeId, index) =>
      Object.assign(new ProbationRecord(), {
        id: index + 1,
        employeeId,
        startDate: '2026-11-20',
        expectedEndDate: '2027-05-20',
        status: ProbationStatus.UNDER_PROBATION,
        isActive: true,
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  async function scheduleEvaluation(probationRecordId = 1): Promise<number> {
    const response = await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send({ ...schedule, probationRecordId })
      .expect(201);
    return (response.body as { id: number }).id;
  }
  async function saveCompleteDraft(id: number): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send(completeDraft)
      .expect(200);
  }
  async function submitEvaluation(id: number): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/evaluations/${id}/submit`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .expect(200);
  }

  it('schedules the current supervisor and advances the probation status', async () => {
    await scheduleEvaluation();
    expect(evaluations[0]).toMatchObject({
      probationRecordId: 1,
      supervisorId: 2,
      sequenceNumber: 1,
      status: EvaluationStatus.SCHEDULED,
      overallScore: null,
      submittedAt: null,
    });
    expect(records[0].status).toBe(ProbationStatus.FOR_EVALUATION);
  });

  it('prevents duplicate pending evaluations', async () => {
    await scheduleEvaluation();
    await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send(schedule)
      .expect(409);
    expect(evaluations).toHaveLength(1);
  });

  it.each([
    { ...schedule, scheduledDate: '2026-11-19' },
    { ...schedule, scheduledDate: '2027-05-21' },
    { ...schedule, scheduledDate: '2027-02-30' },
    { ...schedule, scheduledDate: '2027-05-01T00:00:00Z' },
    { ...schedule, supervisorId: 4 },
    { ...schedule, status: 'SUBMITTED' },
    { ...schedule, overallScore: 5 },
    { probationRecordId: 1 },
  ])('rejects invalid scheduling data %#', async (body) => {
    await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send(body)
      .expect(400);
    expect(evaluations).toHaveLength(0);
    expect(records[0].status).toBe(ProbationStatus.UNDER_PROBATION);
  });

  it.each([
    'unassigned',
    'self',
    'inactive supervisor',
    'missing login',
    'inactive login',
    'wrong role',
  ])('requires an eligible supervisor: %s', async (kind) => {
    if (kind === 'unassigned') employees[0].supervisorId = null;
    if (kind === 'self') employees[0].supervisorId = 1;
    if (kind === 'inactive supervisor') employees[1].isActive = false;
    if (kind === 'missing login') employees[1].userId = null;
    if (kind === 'inactive login') accounts[1].isActive = false;
    if (kind === 'wrong role') accounts[1].role = UserRole.EMPLOYEE;
    await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send(schedule)
      .expect(400);
    expect(evaluations).toHaveLength(0);
  });

  it.each([
    'inactive employee',
    'regular employee',
    'inactive period',
    'completed period',
  ])('rejects scheduling for %s', async (kind) => {
    if (kind === 'inactive employee') employees[0].isActive = false;
    if (kind === 'regular employee')
      employees[0].employmentStatus = EmploymentStatus.REGULAR;
    if (kind === 'inactive period') records[0].isActive = false;
    if (kind === 'completed period')
      records[0].status = ProbationStatus.COMPLETED;
    await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send(schedule)
      .expect(kind.includes('employee') ? 400 : 409);
    expect(evaluations).toHaveLength(0);
  });

  it('saves partial drafts, preserves earlier fields, and allows clearing an unfinished score', async () => {
    const id = await scheduleEvaluation();
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send({ workQuality: 4 })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send({ productivity: 5 })
      .expect(200);
    expect(evaluations[0]).toMatchObject({
      workQuality: 4,
      productivity: 5,
      status: EvaluationStatus.DRAFT,
      overallScore: null,
    });
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send({ workQuality: null })
      .expect(200);
    expect(evaluations[0].workQuality).toBeNull();
  });

  it.each([
    {},
    { workQuality: 0 },
    { workQuality: 6 },
    { workQuality: 2.5 },
    { attendance: '4' },
    { recommendation: 'APPROVED' },
    { overallScore: 5 },
    { status: 'SUBMITTED' },
  ])('rejects invalid drafts and protected fields %#', async (body) => {
    const id = await scheduleEvaluation();
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send(body)
      .expect(400);
    expect(evaluations[0].status).toBe(EvaluationStatus.SCHEDULED);
  });

  it('requires every score and a recommendation before submission', async () => {
    const id = await scheduleEvaluation();
    await request(app.getHttpServer())
      .post(`/api/evaluations/${id}/submit`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .expect(400);
    await saveCompleteDraft(id);
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send({ recommendation: null })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/evaluations/${id}/submit`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .expect(400);
    expect(evaluations[0].submittedAt).toBeNull();
    expect(records[0].status).toBe(ProbationStatus.FOR_EVALUATION);
  });

  it('calculates the average, submits, and prevents later changes', async () => {
    const id = await scheduleEvaluation();
    await saveCompleteDraft(id);
    await submitEvaluation(id);
    expect(evaluations[0]).toMatchObject({
      overallScore: '4.43',
      status: EvaluationStatus.SUBMITTED,
    });
    expect(evaluations[0].submittedAt).toBeInstanceOf(Date);
    expect(records[0].status).toBe(ProbationStatus.FOR_HR_REVIEW);
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send({ workQuality: 1 })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/evaluations/${id}/submit`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .expect(409);
    expect(evaluations[0].overallScore).toBe('4.43');
  });

  it('scopes supervisor lists and hides other supervisors evaluations', async () => {
    const first = await scheduleEvaluation();
    const second = await scheduleEvaluation(2);
    const list = await request(app.getHttpServer())
      .get('/api/evaluations')
      .auth(tokens.supervisorA, { type: 'bearer' })
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect((list.body as { id: number }[])[0].id).toBe(first);
    await request(app.getHttpServer())
      .get(`/api/evaluations/${second}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${first}`)
      .auth(tokens.supervisorB, { type: 'bearer' })
      .send(completeDraft)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/evaluations/${first}/submit`)
      .auth(tokens.supervisorB, { type: 'bearer' })
      .expect(404);
  });

  it('hides drafts from employees and exposes only their own submitted result', async () => {
    const id = await scheduleEvaluation();
    await saveCompleteDraft(id);
    await request(app.getHttpServer())
      .get('/api/evaluations')
      .auth(tokens.employeeA, { type: 'bearer' })
      .expect(200)
      .expect([]);
    await request(app.getHttpServer())
      .get(`/api/evaluations/${id}`)
      .auth(tokens.employeeA, { type: 'bearer' })
      .expect(404);
    await submitEvaluation(id);
    await request(app.getHttpServer())
      .get(`/api/evaluations/${id}`)
      .auth(tokens.employeeA, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/evaluations')
      .auth(tokens.employeeB, { type: 'bearer' })
      .expect(200)
      .expect([]);
    await request(app.getHttpServer())
      .get(`/api/evaluations/${id}`)
      .auth(tokens.employeeB, { type: 'bearer' })
      .expect(404);
  });

  it('keeps history and increments the sequence after an extension reopens probation', async () => {
    const id = await scheduleEvaluation();
    await saveCompleteDraft(id);
    await submitEvaluation(id);
    records[0].status = ProbationStatus.UNDER_PROBATION;
    records[0].expectedEndDate = '2027-11-20';
    await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send({ ...schedule, scheduledDate: '2027-10-20' })
      .expect(201);
    expect(evaluations).toHaveLength(2);
    expect(evaluations[0].status).toBe(EvaluationStatus.SUBMITTED);
    expect(evaluations[1].sequenceNumber).toBe(2);
  });

  it('rolls back a scheduled evaluation if the probation status cannot be saved', async () => {
    failRecordSave = true;
    await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send(schedule)
      .expect(500);
    expect(evaluations).toHaveLength(0);
    expect(records[0].status).toBe(ProbationStatus.UNDER_PROBATION);
  });

  it('rolls back submission if its probation status update fails', async () => {
    const id = await scheduleEvaluation();
    await saveCompleteDraft(id);
    failRecordSave = true;
    await request(app.getHttpServer())
      .post(`/api/evaluations/${id}/submit`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .expect(500);
    expect(evaluations[0].status).toBe(EvaluationStatus.DRAFT);
    expect(evaluations[0].overallScore).toBeNull();
    expect(records[0].status).toBe(ProbationStatus.FOR_EVALUATION);
  });

  it('rejects writes after the period is deactivated or the supervisor employee becomes inactive', async () => {
    const id = await scheduleEvaluation();
    records[0].isActive = false;
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send(completeDraft)
      .expect(409);
    records[0].isActive = true;
    employees[1].isActive = false;
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send(completeDraft)
      .expect(404);
  });

  it('validates identifiers and handles missing records', async () => {
    await request(app.getHttpServer())
      .get('/api/evaluations/abc')
      .auth(tokens.hr, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/evaluations/999')
      .auth(tokens.hr, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send({ ...schedule, probationRecordId: 999 })
      .expect(404);
  });

  const routes: { method: 'get' | 'post' | 'patch'; path: string }[] = [
    { method: 'get', path: '/api/evaluations' },
    { method: 'get', path: '/api/evaluations/1' },
    { method: 'post', path: '/api/evaluations' },
    { method: 'patch', path: '/api/evaluations/1' },
    { method: 'post', path: '/api/evaluations/1/submit' },
  ];
  it.each(routes)(
    'requires login for $method $path',
    async ({ method, path }) => {
      await request(app.getHttpServer())[method](path).expect(401);
    },
  );
  it.each(['supervisorA', 'employeeA'])(
    'prevents %s from scheduling evaluations',
    async (actor) => {
      await request(app.getHttpServer())
        .post('/api/evaluations')
        .auth(tokens[actor], { type: 'bearer' })
        .send(schedule)
        .expect(403);
    },
  );
  it.each(['hr', 'employeeA'])(
    'prevents %s from grading or submitting',
    async (actor) => {
      const id = await scheduleEvaluation();
      await request(app.getHttpServer())
        .patch(`/api/evaluations/${id}`)
        .auth(tokens[actor], { type: 'bearer' })
        .send(completeDraft)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/evaluations/${id}/submit`)
        .auth(tokens[actor], { type: 'bearer' })
        .expect(403);
    },
  );
});
