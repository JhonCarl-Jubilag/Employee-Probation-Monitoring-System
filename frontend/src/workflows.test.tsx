import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, loadRecords, setSession } from './api';
import {
  availableDecisions,
  daysUntil,
  editableProbation,
  emptyRecords,
  pagesFor,
  type Account,
  type Employee,
  type Evaluation,
  type Probation,
  type Records,
  type Role,
} from './domain';

const employee: Employee = {
  id: '3',
  employeeNumber: 'QA-003',
  firstName: 'Sam',
  lastName: 'Rivera',
  department: 'Operations',
  position: 'Assistant',
  dateHired: '2026-11-01',
  employmentStatus: 'PROBATIONARY',
  isActive: true,
  userId: null,
  supervisorId: '4',
};
const supervisor: Employee = {
  ...employee,
  id: '4',
  employeeNumber: 'QA-SUP',
  firstName: 'Robin',
  lastName: 'Lopez',
  userId: '2',
  supervisorId: null,
};
const period: Probation = {
  id: '10',
  employeeId: '3',
  startDate: '2026-11-01',
  expectedEndDate: '2027-05-01',
  status: 'FOR_HR_REVIEW',
  isActive: true,
  createdByUserId: '1',
  employee,
};
const evaluation: Evaluation = {
  id: '20',
  probationRecordId: '10',
  supervisorId: '4',
  sequenceNumber: 1,
  scheduledDate: '2026-11-20',
  status: 'DRAFT',
  workQuality: 3,
  productivity: 3,
  attendance: 3,
  punctuality: 3,
  communication: 3,
  teamwork: 3,
  initiative: 3,
  overallScore: null,
  comments: 'Draft feedback',
  recommendation: 'REGULARIZE',
  submittedAt: null,
  probationRecord: period,
  supervisor,
};
function records(): Records {
  return {
    ...emptyRecords,
    employees: [employee, supervisor],
    probations: [period],
    evaluations: [evaluation],
    decisions: [],
    users: [
      { id: '1', email: 'hr@example.test', role: 'HR_ADMIN', isActive: true },
      {
        id: '2',
        email: 'supervisor@example.test',
        role: 'SUPERVISOR',
        isActive: true,
      },
    ],
  };
}
function account(role: Role): Account {
  return {
    id: role === 'HR_ADMIN' ? '1' : role === 'SUPERVISOR' ? '2' : '8',
    email: `${role.toLowerCase()}@example.test`,
    role,
  };
}
function mockServer(
  role: Role = 'HR_ADMIN',
  data = records(),
  mutation?: (path: string, init: RequestInit) => Response | undefined,
) {
  return vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = String(input).replace('/api', '');
      if (path === '/auth/login')
        return Response.json({
          access_token: 'synthetic-test-session',
          user: account(role),
        });
      if (path === '/auth/me') return Response.json(account(role));
      if (init.method && init.method !== 'GET')
        return mutation?.(path, init) ?? Response.json({ id: '99' });
      const resources: Record<string, unknown> = {
        '/employees': data.employees,
        '/users': data.users,
        '/probation-records': data.probations,
        '/evaluations': data.evaluations,
        '/regularization-decisions': data.decisions,
      };
      return path in resources
        ? Response.json(resources[path])
        : Response.json({ message: 'Not found' }, { status: 404 });
    }),
  );
}
async function openApp(
  role: Role = 'HR_ADMIN',
  data = records(),
  mutation?: (path: string, init: RequestInit) => Response | undefined,
) {
  mockServer(role, data, mutation);
  setSession('synthetic-test-session');
  render(<App />);
  await screen.findByRole('heading', { name: 'Overview', level: 1 });
  await waitFor(() =>
    expect(screen.queryByText('Loading your records…')).toBeNull(),
  );
}
function calls(method?: string) {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => !method || init?.method === method);
}
beforeEach(() => {
  setSession('');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  setSession('');
  vi.unstubAllGlobals();
});

describe('Frontend workflows', () => {
  it('signs in through the API without saving the password', async () => {
    mockServer('SUPERVISOR');
    render(<App />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('Email address'),
      'supervisor@example.test',
    );
    await user.type(
      screen.getByLabelText('Password'),
      'Synthetic test password',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Overview', level: 1 });
    const login = calls('POST').find(([path]) => path === '/api/auth/login');
    expect(JSON.parse(String(login?.[1]?.body))).toEqual({
      email: 'supervisor@example.test',
      password: 'Synthetic test password',
    });
    expect(sessionStorage.getItem('epms.session')).toBe(
      'synthetic-test-session',
    );
    expect(JSON.stringify(sessionStorage)).not.toContain(
      'Synthetic test password',
    );
  });
  it('does not request HR-only resources for supervisors', async () => {
    await openApp('SUPERVISOR');
    expect(screen.queryByRole('link', { name: 'Employees' })).toBeNull();
    expect(
      calls().some(([path]) =>
        ['/api/users', '/api/employees', '/api/probation-records'].includes(
          String(path),
        ),
      ),
    ).toBe(false);
  });
  it('does not expose HR menus or create actions to employees, even for an edited URL', async () => {
    await openApp('EMPLOYEE');
    act(() => {
      window.location.hash = 'users';
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(screen.queryByRole('link', { name: 'User accounts' })).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Overview', level: 1 }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('link', { name: 'Evaluations' }));
    expect(
      screen.queryByRole('button', { name: 'Schedule evaluation' }),
    ).toBeNull();
  });
  it('shows a loading failure instead of a misleading empty dashboard', async () => {
    mockServer();
    setSession('synthetic-test-session');
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith('/auth/me')
        ? Response.json(account('HR_ADMIN'))
        : Response.json({ message: 'Database unavailable' }, { status: 503 }),
    );
    render(<App />);
    await screen.findByRole('alert');
    expect(screen.getByText('Database unavailable')).toBeTruthy();
    expect(screen.queryByText('Active employees')).toBeNull();
  });
  it('converts selected relationship IDs to numbers and keeps optional links null', async () => {
    const data = {
      ...records(),
      employees: [],
      probations: [],
      evaluations: [],
    };
    await openApp('HR_ADMIN', data);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Employees' }));
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    for (const [name, value] of [
      ['Employee number', 'QA-009'],
      ['First name', 'Jamie'],
      ['Last name', 'Cruz'],
      ['Department', 'Operations'],
      ['Position', 'Assistant'],
    ])
      await user.type(screen.getByLabelText(name, { exact: true }), value);
    await user.type(screen.getByLabelText('Date hired'), '2026-11-01');
    await user.selectOptions(screen.getByLabelText(/Login account/), '2');
    await user.click(screen.getByRole('button', { name: 'Create employee' }));
    await waitFor(() => expect(calls('POST').length).toBe(1));
    const body = JSON.parse(String(calls('POST')[0][1]?.body));
    expect(body.userId).toBe(2);
    expect(body.supervisorId).toBeNull();
    expect(body.employeeNumber).toBe('QA-009');
  });
  it('saves the currently edited ratings before submitting, with no draft object sent to the submit endpoint', async () => {
    await openApp('SUPERVISOR');
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Evaluations' }));
    await user.click(screen.getByRole('button', { name: 'Complete' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Work quality' })).getByRole(
        'radio',
        { name: '5' },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Submit evaluation' }));
    expect(calls('POST')).toHaveLength(0);
    await user.click(
      screen.getByRole('button', { name: 'Confirm submission' }),
    );
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect(JSON.parse(String(calls('PATCH')[0][1]?.body)).workQuality).toBe(5);
    expect(calls('POST')[0][0]).toBe('/api/evaluations/20/submit');
    expect(calls('POST')[0][1]?.body).toBeUndefined();
    expect(
      vi.mocked(fetch).mock.invocationCallOrder[
        vi.mocked(fetch).mock.calls.findIndex(([, i]) => i?.method === 'PATCH')
      ],
    ).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[
        vi.mocked(fetch).mock.calls.findIndex(([, i]) => i?.method === 'POST')
      ],
    );
  });
  it('never submits when saving the latest draft fails', async () => {
    await openApp('SUPERVISOR', records(), (_path, init) =>
      init.method === 'PATCH'
        ? Response.json({ message: 'Draft conflict' }, { status: 409 })
        : undefined,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Evaluations' }));
    await user.click(screen.getByRole('button', { name: 'Complete' }));
    await user.click(screen.getByRole('button', { name: 'Submit evaluation' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm submission' }),
    );
    await screen.findByText('Draft conflict');
    expect(calls('POST')).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
  it('keeps submitted evaluations read-only', async () => {
    const data = records();
    data.evaluations = [
      {
        ...evaluation,
        status: 'SUBMITTED',
        overallScore: '3.00',
        submittedAt: '2026-11-20T08:00:00Z',
      },
    ];
    await openApp('SUPERVISOR', data);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Evaluations' }));
    await user.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Submit evaluation' }),
    ).toBeNull();
    expect(screen.getByLabelText('Comments').hasAttribute('disabled')).toBe(
      true,
    );
  });
  it('requires a review step before recording an HR decision and includes an extension date only when needed', async () => {
    const data = records();
    data.evaluations = [
      {
        ...evaluation,
        status: 'SUBMITTED',
        overallScore: '3.00',
        submittedAt: '2026-11-20T08:00:00Z',
      },
    ];
    await openApp('HR_ADMIN', data);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /HR decisions/ }));
    await user.click(
      screen.getByRole('button', { name: 'Record HR decision' }),
    );
    await user.selectOptions(
      screen.getByLabelText('Submitted evaluation'),
      '20',
    );
    await user.selectOptions(
      screen.getByLabelText('Decision', { exact: true }),
      'EXTENDED',
    );
    await user.type(
      screen.getByLabelText(/New probation end date/),
      '2027-06-01',
    );
    await user.click(screen.getByRole('button', { name: 'Review decision' }));
    expect(calls('POST')).toHaveLength(0);
    await user.click(
      screen.getByRole('button', { name: 'Confirm and record decision' }),
    );
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect(JSON.parse(String(calls('POST')[0][1]?.body))).toMatchObject({
      evaluationId: 20,
      decision: 'EXTENDED',
      newEndDate: '2027-06-01',
    });
  });
  it('blocks self-deactivation and self-role editing in the account screen', async () => {
    await openApp();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'User accounts' }));
    const row = screen.getByText('Your account').closest('tr')!;
    expect(
      within(row).queryByRole('button', { name: 'Deactivate' }),
    ).toBeNull();
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    expect((screen.getByLabelText('Role') as HTMLSelectElement).disabled).toBe(
      true,
    );
  });
  it('clears an expired token and returns to sign in without retaining records', async () => {
    await openApp();
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ message: 'Unauthorized' }, { status: 401 }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh records' }),
    );
    await screen.findByRole('button', { name: 'Sign in' });
    expect(sessionStorage.getItem('epms.session')).toBeNull();
    expect(screen.queryByText(employee.employeeNumber)).toBeNull();
  });
  it('clears the token on sign out', async () => {
    await openApp();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(sessionStorage.getItem('epms.session')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
describe('Workflow rules and API failures', () => {
  it('counts calendar days without local timezone or daylight-saving shifts', () => {
    expect(daysUntil('2026-11-24', '2026-11-23')).toBe(1);
    expect(daysUntil('2026-11-22', '2026-11-23')).toBe(-1);
    expect(daysUntil('2026-11-23', '2026-11-23')).toBe(0);
  });
  it('offers only the latest submitted evaluation without a decision', () => {
    const data = records();
    data.evaluations = [
      { ...evaluation, status: 'SUBMITTED' },
      { ...evaluation, id: '21', sequenceNumber: 2, status: 'SUBMITTED' },
    ];
    expect(availableDecisions(data).map((e) => e.id)).toEqual(['21']);
    data.decisions = [
      {
        id: '30',
        probationRecordId: '10',
        evaluationId: '21',
        decidedByUserId: '1',
        decision: 'EXTENDED',
        decisionDate: '2026-11-23',
        newEndDate: '2027-06-01',
        previousEndDate: '2027-05-01',
        remarks: null,
      },
    ];
    expect(availableDecisions(data)).toEqual([]);
  });
  it('does not offer date edits after evaluation history exists', () => {
    const data = records();
    expect(
      editableProbation({ ...period, status: 'UNDER_PROBATION' }, data),
    ).toBe(false);
    expect(
      editableProbation(
        { ...period, status: 'UNDER_PROBATION' },
        { ...data, evaluations: [] },
      ),
    ).toBe(true);
  });
  it('scopes employee data loading to evaluations and decisions', async () => {
    mockServer('EMPLOYEE');
    await loadRecords('EMPLOYEE');
    expect(calls()).toHaveLength(2);
    expect(pagesFor('EMPLOYEE')).toEqual([
      'dashboard',
      'evaluations',
      'decisions',
    ]);
  });
  it('preserves API validation messages for the form', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: ['Invalid end date', 'Employee is inactive'] },
            { status: 400 },
          ),
        ),
    );
    await expect(api('/probation-records', 'POST', {})).rejects.toThrow(
      'Invalid end date. Employee is inactive',
    );
  });
  it('explains unreachable servers without exposing network internals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Network failure')),
    );
    await expect(api('/employees')).rejects.toThrow(
      'Cannot reach the server. Start the backend, then try again.',
    );
  });
});
