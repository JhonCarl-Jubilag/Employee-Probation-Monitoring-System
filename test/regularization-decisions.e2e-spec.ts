import { Global, Module, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource, QueryFailedError } from 'typeorm';
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
import { ProbationRecordsModule } from '../src/probation-records/probation-records.module';
import {
  DecisionType,
  RegularizationDecision,
} from '../src/regularization-decisions/entities/regularization-decision.entity';
import { RegularizationDecisionsModule } from '../src/regularization-decisions/regularization-decisions.module';
import { User, UserRole } from '../src/users/entities/user.entity';

type Row = { id: number };
type EntityClass = new () => Row;
type Lookup = {
  where?: Record<string, unknown>;
  order?: Record<string, 'ASC' | 'DESC'>;
};

// Isolated HTTP workflow tests: no .env, real accounts, or MySQL connections.
describe('HR decisions and complete workflow (HTTP)', () => {
  let app: INestApplication<App>;
  let tables: Map<EntityClass, Row[]>;
  let tokens: Record<string, string>;
  let failureEntity: EntityClass | null;
  let forceDuplicate: boolean;

  const today = () =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' }).format(
      new Date(),
    );
  const endYear = new Date().getUTCFullYear() + 1;
  const previousEndDate = `${endYear}-05-20`;
  const newEndDate = `${endYear}-06-20`;
  const body = () => ({
    evaluationId: 1,
    decision: DecisionType.REGULARIZED,
    decisionDate: today(),
    remarks: 'Synthetic HR decision for automated testing.',
  });

  function rows<T extends Row>(entity: new () => T): T[] {
    return (tables.get(entity) ?? []) as T[];
  }
  function view(row: Row): Record<string, unknown> {
    const result: Record<string, unknown> = { ...row };
    if (row instanceof ProbationRecord)
      result.employee = rows(Employee).find(
        (item) => item.id === row.employeeId,
      );
    if (row instanceof Evaluation) {
      result.supervisor = rows(Employee).find(
        (item) => item.id === row.supervisorId,
      );
      const record = rows(ProbationRecord).find(
        (item) => item.id === row.probationRecordId,
      );
      result.probationRecord = record ? view(record) : null;
    }
    if (row instanceof RegularizationDecision) {
      const record = rows(ProbationRecord).find(
        (item) => item.id === row.probationRecordId,
      );
      const evaluation = rows(Evaluation).find(
        (item) => item.id === row.evaluationId,
      );
      result.probationRecord = record ? view(record) : null;
      result.evaluation = evaluation ? view(evaluation) : null;
    }
    return result;
  }
  function matches(
    actual: Record<string, unknown>,
    where: Record<string, unknown>,
  ): boolean {
    return Object.entries(where).every(([key, expected]) => {
      const value = actual[key];
      if (expected !== null && typeof expected === 'object') {
        return (
          value !== null &&
          typeof value === 'object' &&
          matches(
            value as Record<string, unknown>,
            expected as Record<string, unknown>,
          )
        );
      }
      return value === expected;
    });
  }
  function repository<T extends Row>(entity: new () => T) {
    function selected(options: Lookup): T[] {
      const result = rows(entity).filter((row) =>
        matches(view(row), options.where ?? {}),
      );
      for (const [key, direction] of Object.entries(options.order ?? {})) {
        result.sort(
          (left, right) =>
            (Number(view(left)[key]) - Number(view(right)[key])) *
            (direction === 'DESC' ? -1 : 1),
        );
      }
      return result;
    }
    return {
      find: (options: Lookup) =>
        Promise.resolve(
          selected(options).map((row) => Object.assign(new entity(), row)),
        ),
      findOne: (options: Lookup) => {
        const row = selected(options)[0];
        return Promise.resolve(row ? Object.assign(new entity(), row) : null);
      },
      count: (options: Lookup) => Promise.resolve(selected(options).length),
      create: (values: Partial<T>) => Object.assign(new entity(), values),
      save: (row: T): Promise<T> => {
        if (failureEntity === entity)
          return Promise.reject(new Error('Synthetic save failure'));
        if (
          (entity as EntityClass) === RegularizationDecision &&
          forceDuplicate
        )
          return Promise.reject(
            new QueryFailedError(
              'synthetic insert',
              [],
              Object.assign(new Error('Duplicate test decision'), {
                code: 'ER_DUP_ENTRY',
              }),
            ),
          );
        const existing = rows(entity);
        const saved = Object.assign(new entity(), row, {
          id: row.id ?? Math.max(0, ...existing.map((item) => item.id)) + 1,
        });
        const index = existing.findIndex((item) => item.id === saved.id);
        if (index === -1) existing.push(saved);
        else existing[index] = saved;
        tables.set(entity, existing);
        return Promise.resolve(Object.assign(new entity(), saved));
      },
    };
  }

  const repositories = new Map<unknown, unknown>();
  const manager = {
    getRepository: (entity: unknown) => repositories.get(entity),
  } as unknown as EntityManager;
  const testDataSource = {
    async transaction<T>(
      work: (entityManager: EntityManager) => Promise<T>,
    ): Promise<T> {
      const snapshot = new Map<EntityClass, Row[]>();
      for (const [entity, values] of tables)
        snapshot.set(
          entity,
          values.map((row) => Object.assign(new entity(), row)),
        );
      try {
        return await work(manager);
      } catch (error: unknown) {
        tables = snapshot;
        throw error;
      }
    },
  };

  beforeAll(async () => {
    for (const entity of [
      User,
      Employee,
      ProbationRecord,
      Evaluation,
      RegularizationDecision,
    ])
      repositories.set(entity, repository<Row>(entity));
    @Global()
    @Module({
      providers: [{ provide: DataSource, useValue: testDataSource }],
      exports: [DataSource],
    })
    class TestDatabaseModule {}

    const builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: 'decisions-tests-only-secret-not-for-real-use',
            }),
          ],
        }),
        TestDatabaseModule,
        AuthModule,
        ProbationRecordsModule,
        EvaluationsModule,
        RegularizationDecisionsModule,
      ],
    });
    for (const entity of [
      User,
      ProbationRecord,
      Evaluation,
      RegularizationDecision,
    ])
      builder
        .overrideProvider(getRepositoryToken(entity))
        .useValue(repositories.get(entity));
    const fixture = await builder.compile();
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
    }))
      tokens[name] = await jwt.signAsync({ sub: String(id) });
  });

  beforeEach(() => {
    tables = new Map();
    failureEntity = null;
    forceDuplicate = false;
    tables.set(
      User,
      [
        UserRole.HR_ADMIN,
        UserRole.SUPERVISOR,
        UserRole.EMPLOYEE,
        UserRole.SUPERVISOR,
        UserRole.EMPLOYEE,
      ].map((role, index) =>
        Object.assign(new User(), {
          id: index + 1,
          email: `decision-test${index + 1}@example.test`,
          role,
          isActive: true,
        }),
      ),
    );
    tables.set(
      Employee,
      [
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
          dateHired: '2026-01-01',
          isActive: true,
        }),
      ),
    );
    tables.set(
      ProbationRecord,
      [1, 3].map((employeeId, index) =>
        Object.assign(new ProbationRecord(), {
          id: index + 1,
          employeeId,
          startDate: '2026-01-01',
          expectedEndDate: previousEndDate,
          status: ProbationStatus.FOR_HR_REVIEW,
          isActive: true,
        }),
      ),
    );
    tables.set(
      Evaluation,
      [2, 4].map((supervisorId, index) =>
        Object.assign(new Evaluation(), {
          id: index + 1,
          probationRecordId: index + 1,
          supervisorId,
          sequenceNumber: 1,
          scheduledDate: today(),
          status: EvaluationStatus.SUBMITTED,
          workQuality: 4,
          productivity: 4,
          attendance: 4,
          punctuality: 4,
          communication: 4,
          teamwork: 4,
          initiative: 4,
          overallScore: '4.00',
          recommendation: Recommendation.REGULARIZE,
          submittedAt: new Date(),
        }),
      ),
    );
    tables.set(RegularizationDecision, []);
  });
  afterAll(async () => {
    await app?.close();
  });

  async function decide(payload: object = body()) {
    return request(app.getHttpServer())
      .post('/api/regularization-decisions')
      .auth(tokens.hr, { type: 'bearer' })
      .send(payload);
  }

  it.each([
    [DecisionType.REGULARIZED, EmploymentStatus.REGULAR],
    [DecisionType.NOT_REGULARIZED, EmploymentStatus.SEPARATED],
  ])('records %s and updates the employee to %s', async (decision, status) => {
    const response = await decide({ ...body(), decision });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      evaluationId: 1,
      probationRecordId: 1,
      decidedByUserId: 1,
      decision,
      previousEndDate: null,
      newEndDate: null,
    });
    expect(rows(Employee)[0].employmentStatus).toBe(status);
    expect(rows(ProbationRecord)[0]).toMatchObject({
      status: ProbationStatus.COMPLETED,
      isActive: false,
    });
    expect(rows(Evaluation)[0].status).toBe(EvaluationStatus.SUBMITTED);
  });

  it('extends probation, preserves end-date history, and keeps employment probationary', async () => {
    const response = await decide({
      ...body(),
      decision: DecisionType.EXTENDED,
      newEndDate,
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ previousEndDate, newEndDate });
    expect(rows(Employee)[0].employmentStatus).toBe(
      EmploymentStatus.PROBATIONARY,
    );
    expect(rows(ProbationRecord)[0]).toMatchObject({
      status: ProbationStatus.UNDER_PROBATION,
      isActive: true,
      expectedEndDate: newEndDate,
    });
  });

  it.each(Object.values(DecisionType))(
    'prevents a second decision after %s',
    async (decision) => {
      const payload = {
        ...body(),
        decision,
        ...(decision === DecisionType.EXTENDED ? { newEndDate } : {}),
      };
      expect((await decide(payload)).status).toBe(201);
      expect((await decide(payload)).status).toBe(409);
      expect(rows(RegularizationDecision)).toHaveLength(1);
    },
  );

  it.each([
    {},
    { ...body(), evaluationId: '1' },
    { ...body(), evaluationId: 0 },
    { ...body(), decision: 'REGULARIZE' },
    { ...body(), decisionDate: null },
    { ...body(), decisionDate: '2026-02-30' },
    { ...body(), probationRecordId: 2 },
    { ...body(), decidedByUserId: 2 },
    { ...body(), newEndDate },
    { ...body(), decision: DecisionType.EXTENDED },
    { ...body(), decision: DecisionType.EXTENDED, newEndDate: null },
    { ...body(), decision: DecisionType.EXTENDED, newEndDate: previousEndDate },
    { ...body(), decision: DecisionType.EXTENDED, newEndDate: '2026-01-01' },
    { ...body(), decision: DecisionType.EXTENDED, newEndDate: '2027-02-30' },
  ])(
    'rejects invalid decision fields or extension dates %#',
    async (payload) => {
      expect((await decide(payload)).status).toBe(400);
      expect(rows(RegularizationDecision)).toHaveLength(0);
      expect(rows(ProbationRecord)[0].status).toBe(
        ProbationStatus.FOR_HR_REVIEW,
      );
    },
  );

  it('rejects a date before submission or in the future', async () => {
    expect(
      (await decide({ ...body(), decisionDate: '2026-01-01' })).status,
    ).toBe(400);
    expect(
      (await decide({ ...body(), decisionDate: '9999-01-01' })).status,
    ).toBe(400);
  });

  it('uses the Manila submission date rather than the UTC calendar day', async () => {
    rows(Evaluation)[0].submittedAt = new Date('2026-01-01T16:30:00Z');
    expect(
      (await decide({ ...body(), decisionDate: '2026-01-01' })).status,
    ).toBe(400);
    expect(
      (await decide({ ...body(), decisionDate: '2026-01-02' })).status,
    ).toBe(201);
  });

  it.each([EvaluationStatus.SCHEDULED, EvaluationStatus.DRAFT])(
    'rejects an evaluation still marked %s',
    async (status) => {
      rows(Evaluation)[0].status = status;
      expect((await decide()).status).toBe(409);
      expect(rows(RegularizationDecision)).toHaveLength(0);
    },
  );

  it('requires a submission timestamp and the latest evaluation', async () => {
    rows(Evaluation)[0].submittedAt = null;
    expect((await decide()).status).toBe(409);
    rows(Evaluation)[0].submittedAt = new Date();
    rows(Evaluation).push(
      Object.assign(new Evaluation(), rows(Evaluation)[0], {
        id: 3,
        sequenceNumber: 2,
      }),
    );
    expect((await decide()).status).toBe(409);
  });

  it.each([
    'inactive period',
    'under probation',
    'evaluation pending',
    'completed',
    'inactive employee',
    'regular employee',
    'separated employee',
  ])('rejects an ineligible workflow: %s', async (kind) => {
    if (kind === 'inactive period') rows(ProbationRecord)[0].isActive = false;
    if (kind === 'under probation')
      rows(ProbationRecord)[0].status = ProbationStatus.UNDER_PROBATION;
    if (kind === 'evaluation pending')
      rows(ProbationRecord)[0].status = ProbationStatus.FOR_EVALUATION;
    if (kind === 'completed')
      rows(ProbationRecord)[0].status = ProbationStatus.COMPLETED;
    if (kind === 'inactive employee') rows(Employee)[0].isActive = false;
    if (kind === 'regular employee')
      rows(Employee)[0].employmentStatus = EmploymentStatus.REGULAR;
    if (kind === 'separated employee')
      rows(Employee)[0].employmentStatus = EmploymentStatus.SEPARATED;
    expect((await decide()).status).toBe(409);
    expect(rows(RegularizationDecision)).toHaveLength(0);
  });

  it.each([Employee, ProbationRecord])(
    'rolls back the decision and related updates when %p cannot be saved',
    async (entity) => {
      failureEntity = entity;
      expect((await decide()).status).toBe(500);
      expect(rows(RegularizationDecision)).toHaveLength(0);
      expect(rows(Employee)[0].employmentStatus).toBe(
        EmploymentStatus.PROBATIONARY,
      );
      expect(rows(ProbationRecord)[0]).toMatchObject({
        status: ProbationStatus.FOR_HR_REVIEW,
        isActive: true,
      });
    },
  );

  it('translates a database duplicate into a conflict without changing states', async () => {
    forceDuplicate = true;
    expect((await decide()).status).toBe(409);
    expect(rows(Employee)[0].employmentStatus).toBe(
      EmploymentStatus.PROBATIONARY,
    );
    expect(rows(RegularizationDecision)).toHaveLength(0);
  });

  it('allows HR, the assigned supervisor, and the employee to read their decision', async () => {
    expect((await decide()).status).toBe(201);
    for (const actor of ['hr', 'supervisorA', 'employeeA']) {
      const list = await request(app.getHttpServer())
        .get('/api/regularization-decisions')
        .auth(tokens[actor], { type: 'bearer' })
        .expect(200);
      expect(list.body).toHaveLength(1);
      await request(app.getHttpServer())
        .get('/api/regularization-decisions/1')
        .auth(tokens[actor], { type: 'bearer' })
        .expect(200);
    }
    for (const actor of ['supervisorB', 'employeeB']) {
      await request(app.getHttpServer())
        .get('/api/regularization-decisions')
        .auth(tokens[actor], { type: 'bearer' })
        .expect(200)
        .expect([]);
      await request(app.getHttpServer())
        .get('/api/regularization-decisions/1')
        .auth(tokens[actor], { type: 'bearer' })
        .expect(404);
    }
  });

  it('has no update or delete endpoints for permanent decision history', async () => {
    expect((await decide()).status).toBe(201);
    await request(app.getHttpServer())
      .patch('/api/regularization-decisions/1')
      .auth(tokens.hr, { type: 'bearer' })
      .send({ decision: DecisionType.EXTENDED })
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/regularization-decisions/1')
      .auth(tokens.hr, { type: 'bearer' })
      .expect(404);
    expect(rows(RegularizationDecision)[0].decision).toBe(
      DecisionType.REGULARIZED,
    );
  });

  it('supports extension, another evaluation, and final regularization without overwriting history', async () => {
    expect(
      (await decide({ ...body(), decision: DecisionType.EXTENDED, newEndDate }))
        .status,
    ).toBe(201);
    const scheduled = await request(app.getHttpServer())
      .post('/api/evaluations')
      .auth(tokens.hr, { type: 'bearer' })
      .send({ probationRecordId: 1, scheduledDate: newEndDate })
      .expect(201);
    const id = (scheduled.body as { id: number }).id;
    expect(scheduled.body).toHaveProperty('sequenceNumber', 2);
    await request(app.getHttpServer())
      .patch(`/api/evaluations/${id}`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .send({
        workQuality: 4,
        productivity: 4,
        attendance: 4,
        punctuality: 4,
        communication: 4,
        teamwork: 4,
        initiative: 4,
        recommendation: Recommendation.REGULARIZE,
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/evaluations/${id}/submit`)
      .auth(tokens.supervisorA, { type: 'bearer' })
      .expect(200);
    expect((await decide({ ...body(), evaluationId: id })).status).toBe(201);
    expect(rows(RegularizationDecision)).toHaveLength(2);
    expect(rows(RegularizationDecision)[0]).toMatchObject({
      decision: DecisionType.EXTENDED,
      previousEndDate,
      newEndDate,
    });
    expect(rows(Employee)[0].employmentStatus).toBe(EmploymentStatus.REGULAR);
    expect(rows(ProbationRecord)[0]).toMatchObject({
      status: ProbationStatus.COMPLETED,
      isActive: false,
    });
  });

  it('protects decision history from ordinary probation edits', async () => {
    expect(
      (await decide({ ...body(), decision: DecisionType.EXTENDED, newEndDate }))
        .status,
    ).toBe(201);
    await request(app.getHttpServer())
      .patch('/api/probation-records/1')
      .auth(tokens.hr, { type: 'bearer' })
      .send({ expectedEndDate: `${endYear}-07-20` })
      .expect(409);
  });

  it.each(['supervisorA', 'employeeA'])(
    'forbids %s from recording HR decisions',
    async (actor) => {
      await request(app.getHttpServer())
        .post('/api/regularization-decisions')
        .auth(tokens[actor], { type: 'bearer' })
        .send(body())
        .expect(403);
      expect(rows(RegularizationDecision)).toHaveLength(0);
    },
  );
  it.each(['/api/regularization-decisions', '/api/regularization-decisions/1'])(
    'requires login to read %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    },
  );
  it('requires login to create a decision', async () => {
    await request(app.getHttpServer())
      .post('/api/regularization-decisions')
      .send(body())
      .expect(401);
  });
  it('validates IDs and handles missing evaluations or decisions', async () => {
    expect((await decide({ ...body(), evaluationId: 999 })).status).toBe(404);
    await request(app.getHttpServer())
      .get('/api/regularization-decisions/abc')
      .auth(tokens.hr, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/regularization-decisions/999')
      .auth(tokens.hr, { type: 'bearer' })
      .expect(404);
  });
});
