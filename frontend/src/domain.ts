export type Role = 'HR_ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';
export type Id = string | number;
export interface Account {
  id: Id;
  email: string;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
}
export interface Employee {
  id: Id;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  dateHired: string;
  employmentStatus: 'PROBATIONARY' | 'REGULAR' | 'SEPARATED';
  isActive: boolean;
  userId: Id | null;
  supervisorId: Id | null;
}
export interface Probation {
  id: Id;
  employeeId: Id;
  startDate: string;
  expectedEndDate: string;
  status: 'UNDER_PROBATION' | 'FOR_EVALUATION' | 'FOR_HR_REVIEW' | 'COMPLETED';
  isActive: boolean;
  createdByUserId: Id;
  employee?: Employee;
}
export const criteria = [
  ['workQuality', 'Work quality'],
  ['productivity', 'Productivity'],
  ['attendance', 'Attendance'],
  ['punctuality', 'Punctuality'],
  ['communication', 'Communication'],
  ['teamwork', 'Teamwork'],
  ['initiative', 'Initiative'],
] as const;
export type Criterion = (typeof criteria)[number][0];
export type Recommendation = 'REGULARIZE' | 'EXTEND' | 'DO_NOT_REGULARIZE';
export type Evaluation = Record<Criterion, number | null> & {
  id: Id;
  probationRecordId: Id;
  supervisorId: Id;
  sequenceNumber: number;
  scheduledDate: string;
  status: 'SCHEDULED' | 'DRAFT' | 'SUBMITTED';
  overallScore: string | null;
  comments: string | null;
  recommendation: Recommendation | null;
  submittedAt: string | null;
  probationRecord?: Probation;
  supervisor?: Employee;
};
export type DecisionType = 'REGULARIZED' | 'EXTENDED' | 'NOT_REGULARIZED';
export interface Decision {
  id: Id;
  probationRecordId: Id;
  evaluationId: Id;
  decidedByUserId: Id;
  decision: DecisionType;
  decisionDate: string;
  remarks: string | null;
  previousEndDate: string | null;
  newEndDate: string | null;
  probationRecord?: Probation;
}
export interface Records {
  employees: Employee[];
  users: Account[];
  probations: Probation[];
  evaluations: Evaluation[];
  decisions: Decision[];
}
export const emptyRecords: Records = {
  employees: [],
  users: [],
  probations: [],
  evaluations: [],
  decisions: [],
};
export type Page =
  | 'dashboard'
  | 'employees'
  | 'probations'
  | 'evaluations'
  | 'decisions'
  | 'users';
export const pageNames: Record<Page, string> = {
  dashboard: 'Overview',
  employees: 'Employees',
  probations: 'Probation records',
  evaluations: 'Evaluations',
  decisions: 'HR decisions',
  users: 'User accounts',
};
export function pagesFor(role: Role): Page[] {
  return role === 'HR_ADMIN'
    ? [
        'dashboard',
        'employees',
        'probations',
        'evaluations',
        'decisions',
        'users',
      ]
    : ['dashboard', 'evaluations', 'decisions'];
}
export const sameId = (a: Id | null | undefined, b: Id | null | undefined) =>
  a != null && b != null && String(a) === String(b);
export const fullName = (employee?: Employee) =>
  employee ? `${employee.firstName} ${employee.lastName}` : 'Employee';
export function employeeFor(
  record: Probation | Evaluation | Decision,
  data: Records,
): Employee | undefined {
  const probation =
    'employeeId' in record
      ? record
      : (record.probationRecord ??
        data.probations.find((p) => sameId(p.id, record.probationRecordId)));
  return (
    probation?.employee ??
    data.employees.find((e) => sameId(e.id, probation?.employeeId))
  );
}
export const labels: Record<string, string> = {
  HR_ADMIN: 'HR administrator',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Employee',
  PROBATIONARY: 'Probationary',
  REGULAR: 'Regular',
  SEPARATED: 'Separated',
  UNDER_PROBATION: 'Under probation',
  FOR_EVALUATION: 'For evaluation',
  FOR_HR_REVIEW: 'For HR review',
  COMPLETED: 'Completed',
  SCHEDULED: 'Scheduled',
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  REGULARIZE: 'Regularize',
  EXTEND: 'Extend probation',
  DO_NOT_REGULARIZE: 'Do not regularize',
  REGULARIZED: 'Regularized',
  EXTENDED: 'Extended',
  NOT_REGULARIZED: 'Not regularized',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};
export const label = (value: string | null | undefined) =>
  value ? (labels[value] ?? value) : 'Not set';
export const displayDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-PH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
    : '—';
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function daysUntil(value: string, reference = today()) {
  return Math.round(
    (Date.parse(`${value.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${reference}T00:00:00Z`)) /
      86400000,
  );
}
export function availableDecisions(data: Records) {
  return data.evaluations.filter((e) => {
    const p = data.probations.find((record) =>
      sameId(record.id, e.probationRecordId),
    );
    return (
      e.status === 'SUBMITTED' &&
      p?.isActive &&
      p.status === 'FOR_HR_REVIEW' &&
      !data.decisions.some((d) => sameId(d.evaluationId, e.id)) &&
      !data.evaluations.some(
        (other) =>
          sameId(other.probationRecordId, e.probationRecordId) &&
          other.sequenceNumber > e.sequenceNumber,
      )
    );
  });
}
export function editableProbation(record: Probation, data: Records) {
  return (
    record.isActive &&
    record.status === 'UNDER_PROBATION' &&
    !data.evaluations.some((e) => sameId(e.probationRecordId, record.id)) &&
    !data.decisions.some((d) => sameId(d.probationRecordId, record.id))
  );
}
