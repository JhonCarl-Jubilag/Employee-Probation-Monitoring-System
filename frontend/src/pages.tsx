import {
  IconUsers,
  IconCalendarStats,
  IconClipboardCheck,
  IconFileCheck,
  IconPlus,
} from '@tabler/icons-react';
import { Badge, Empty, Person, Table, type Column } from './components';
import {
  availableDecisions,
  daysUntil,
  displayDate,
  editableProbation,
  employeeFor,
  fullName,
  label,
  sameId,
  type Account,
  type Decision,
  type Employee,
  type Evaluation,
  type Page,
  type Probation,
  type Records,
} from './domain';
import type { Editor } from './editors';

type Props = {
  data: Records;
  actor: Account;
  open: (editor: Editor) => void;
  navigate: (page: Page) => void;
};
const options = (values: string[]) =>
  values.map((value) => ({ value, label: label(value) }));
const key = (row: { id: string | number }) => String(row.id);
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="row-actions">{children}</div>;
}
function Action({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`table-action ${danger ? 'danger' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export const descriptions: Record<Page, string> = {
  dashboard: 'Keep track of probation periods, evaluations, and decisions.',
  employees:
    'Manage employee profiles, account links, and supervisor assignments.',
  probations:
    'Track probation dates and move each record through its review process.',
  evaluations:
    'Schedule reviews, complete ratings, and view submitted evaluations.',
  decisions: 'Record HR outcomes and review the decision history.',
  users: 'Manage login accounts and access to the system.',
};
export function PageActions({
  page,
  actor,
  open,
}: {
  page: Page;
  actor: Account;
  open: (editor: Editor) => void;
}) {
  if (actor.role !== 'HR_ADMIN' || page === 'dashboard') return null;
  const actions: Partial<Record<Page, { text: string; editor: Editor }>> = {
    employees: { text: 'Add employee', editor: { kind: 'employee' } },
    probations: { text: 'Add probation record', editor: { kind: 'probation' } },
    evaluations: { text: 'Schedule evaluation', editor: { kind: 'schedule' } },
    decisions: { text: 'Record HR decision', editor: { kind: 'decision' } },
    users: { text: 'Add user account', editor: { kind: 'user' } },
  };
  const action = actions[page];
  return (
    action && (
      <button className="btn btn-primary" onClick={() => open(action.editor)}>
        <IconPlus size={18} />
        {action.text}
      </button>
    )
  );
}
export function Dashboard({ data, actor, open, navigate }: Props) {
  const hr = actor.role === 'HR_ADMIN';
  const pending = data.evaluations.filter((e) => e.status !== 'SUBMITTED');
  const review = availableDecisions(data);
  const active = data.probations.filter((p) => p.isActive);
  const upcoming = [...active]
    .filter((p) => daysUntil(p.expectedEndDate) <= 30)
    .sort((a, b) => a.expectedEndDate.localeCompare(b.expectedEndDate));
  const stats = hr
    ? [
        {
          name: 'Active employees',
          value: data.employees.filter((e) => e.isActive).length,
          detail: 'Current employee profiles',
          icon: IconUsers,
          page: 'employees' as Page,
        },
        {
          name: 'Active probation',
          value: active.length,
          detail: 'Ongoing probation periods',
          icon: IconCalendarStats,
          page: 'probations' as Page,
        },
        {
          name: 'Pending evaluations',
          value: pending.length,
          detail: 'Scheduled or saved as draft',
          icon: IconClipboardCheck,
          page: 'evaluations' as Page,
        },
        {
          name: 'For HR review',
          value: review.length,
          detail: 'Ready for an HR decision',
          icon: IconFileCheck,
          page: 'decisions' as Page,
        },
      ]
    : [
        {
          name:
            actor.role === 'SUPERVISOR'
              ? 'Assigned evaluations'
              : 'My evaluations',
          value: data.evaluations.length,
          detail:
            actor.role === 'SUPERVISOR'
              ? 'Reviews assigned to you'
              : 'Your submitted reviews',
          icon: IconClipboardCheck,
          page: 'evaluations' as Page,
        },
        {
          name: 'Submitted',
          value: data.evaluations.filter((e) => e.status === 'SUBMITTED')
            .length,
          detail: 'Completed evaluations',
          icon: IconFileCheck,
          page: 'evaluations' as Page,
        },
        ...(actor.role === 'SUPERVISOR'
          ? [
              {
                name: 'To complete',
                value: pending.length,
                detail: 'Scheduled or draft reviews',
                icon: IconCalendarStats,
                page: 'evaluations' as Page,
              },
            ]
          : []),
        {
          name: 'HR decisions',
          value: data.decisions.length,
          detail:
            actor.role === 'EMPLOYEE'
              ? 'Your decision history'
              : 'Decisions on your reviews',
          icon: IconUsers,
          page: 'decisions' as Page,
        },
      ];
  return (
    <>
      <div className="stats-grid">
        {stats.map((s) => (
          <button
            className="card stat-card"
            key={s.name}
            onClick={() => navigate(s.page)}
          >
            <div className="stat-heading">
              <span>{s.name}</span>
              <s.icon size={21} stroke={1.6} />
            </div>
            <strong>{s.value}</strong>
            <span className="stat-detail">{s.detail}</span>
          </button>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="card">
          <header className="section-header">
            <div>
              <h2>
                {hr
                  ? 'Awaiting HR review'
                  : actor.role === 'SUPERVISOR'
                    ? 'Your evaluation queue'
                    : 'Recent evaluations'}
              </h2>
              <p>
                {hr
                  ? 'Submitted evaluations ready for a decision.'
                  : actor.role === 'SUPERVISOR'
                    ? 'Complete your assigned performance reviews.'
                    : 'View the results of your submitted reviews.'}
              </p>
            </div>
            <button
              className="table-action"
              onClick={() => navigate('evaluations')}
            >
              View all
            </button>
          </header>
          {(hr
            ? review
            : actor.role === 'SUPERVISOR'
              ? pending
              : data.evaluations
          ).length ? (
            <div className="queue-list">
              {(hr
                ? review
                : actor.role === 'SUPERVISOR'
                  ? pending
                  : data.evaluations
              )
                .slice(0, 5)
                .map((e) => (
                  <div className="queue-item" key={e.id}>
                    <Person
                      name={
                        employeeFor(e, data)
                          ? fullName(employeeFor(e, data))
                          : `Probation #${e.probationRecordId}`
                      }
                      secondary={`Evaluation ${e.sequenceNumber} · ${displayDate(e.scheduledDate)}`}
                    />
                    <div className="queue-actions">
                      {e.overallScore && (
                        <strong className="score-inline">
                          {e.overallScore}
                          <small>/5</small>
                        </strong>
                      )}
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          open(
                            hr
                              ? { kind: 'decision', evaluationId: String(e.id) }
                              : { kind: 'evaluation', record: e },
                          )
                        }
                      >
                        {hr
                          ? 'Record decision'
                          : e.status === 'SUBMITTED'
                            ? 'View'
                            : 'Complete'}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Empty
              title={
                hr
                  ? 'No evaluations awaiting review'
                  : actor.role === 'SUPERVISOR'
                    ? 'No pending evaluations'
                    : 'No submitted evaluations yet'
              }
            >
              {hr
                ? 'Submitted supervisor evaluations will appear here.'
                : actor.role === 'SUPERVISOR'
                  ? 'Assigned scheduled and draft evaluations will appear here.'
                  : 'Your completed evaluations will appear here when submitted.'}
            </Empty>
          )}
        </section>
        <section className="card">
          <header className="section-header">
            <div>
              <h2>{hr ? 'Probation deadlines' : 'Recent HR decisions'}</h2>
              <p>
                {hr
                  ? 'Active periods ending within 30 days.'
                  : 'Recorded outcomes available to you.'}
              </p>
            </div>
          </header>
          {hr ? (
            upcoming.length ? (
              <div className="deadline-list">
                {upcoming.slice(0, 5).map((p) => (
                  <button
                    className="deadline-item"
                    key={p.id}
                    onClick={() =>
                      open({ kind: 'probationDetails', record: p })
                    }
                  >
                    <span>
                      <strong>{fullName(employeeFor(p, data))}</strong>
                      <small>{displayDate(p.expectedEndDate)}</small>
                    </span>
                    <span
                      className={
                        daysUntil(p.expectedEndDate) < 0
                          ? 'deadline-overdue'
                          : 'deadline-days'
                      }
                    >
                      {daysUntil(p.expectedEndDate) < 0
                        ? `${Math.abs(daysUntil(p.expectedEndDate))} days overdue`
                        : daysUntil(p.expectedEndDate) === 0
                          ? 'Due today'
                          : `${daysUntil(p.expectedEndDate)} days left`}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="No upcoming deadlines">
                There are no active probation periods ending within 30 days.
              </Empty>
            )
          ) : data.decisions.length ? (
            <div className="deadline-list">
              {data.decisions.slice(0, 5).map((d) => (
                <button
                  className="deadline-item"
                  key={d.id}
                  onClick={() => open({ kind: 'decisionDetails', record: d })}
                >
                  <span>
                    <strong>{fullName(employeeFor(d, data))}</strong>
                    <small>{displayDate(d.decisionDate)}</small>
                  </span>
                  <Badge value={d.decision} />
                </button>
              ))}
            </div>
          ) : (
            <Empty title="No decisions yet">
              Recorded HR decisions will appear here.
            </Empty>
          )}
        </section>
      </div>
      {hr && (
        <section className="card workflow-note">
          <IconCalendarStats size={26} stroke={1.5} />
          <div>
            <h3>From probation to a clear decision</h3>
            <p>
              Create a probation record, schedule a supervisor evaluation, then
              record the HR outcome after submission.
            </p>
          </div>
          <button className="btn" onClick={() => navigate('probations')}>
            Open probation records
          </button>
        </section>
      )}
    </>
  );
}
export function RecordPage({ page, ...props }: Props & { page: Page }) {
  const { data, actor, open } = props;
  if (page === 'dashboard') return <Dashboard {...props} />;
  if (page === 'employees') {
    const columns: Column<Employee>[] = [
      {
        label: 'Employee',
        render: (e) => (
          <Person name={fullName(e)} secondary={e.employeeNumber} />
        ),
      },
      {
        label: 'Department / position',
        render: (e) => (
          <>
            <div>{e.department}</div>
            <span className="cell-secondary">{e.position}</span>
          </>
        ),
      },
      {
        label: 'Supervisor',
        render: (e) =>
          e.supervisorId ? (
            fullName(data.employees.find((s) => sameId(s.id, e.supervisorId)))
          ) : (
            <span className="text-secondary">Not assigned</span>
          ),
      },
      { label: 'Date hired', render: (e) => displayDate(e.dateHired) },
      {
        label: 'Status',
        render: (e) => (
          <div className="badge-stack">
            <Badge value={e.employmentStatus} />
            {!e.isActive && <Badge value="INACTIVE" />}
          </div>
        ),
      },
      {
        label: 'Actions',
        render: (e) => (
          <Actions>
            <Action
              onClick={() => open({ kind: 'employeeDetails', record: e })}
            >
              View
            </Action>
            {e.isActive && (
              <>
                <Action onClick={() => open({ kind: 'employee', record: e })}>
                  Edit
                </Action>
                <Action
                  danger
                  onClick={() =>
                    open({
                      kind: 'deactivate',
                      entity: 'employees',
                      id: String(e.id),
                      name: fullName(e),
                    })
                  }
                >
                  Deactivate
                </Action>
              </>
            )}
          </Actions>
        ),
      },
    ];
    return (
      <Table
        rows={data.employees}
        columns={columns}
        rowKey={key}
        searchText={(e) =>
          `${fullName(e)} ${e.employeeNumber} ${e.department} ${e.position}`
        }
        filters={{
          label: 'Employment statuses',
          value: (e) => e.employmentStatus,
          options: options(['PROBATIONARY', 'REGULAR', 'SEPARATED']),
        }}
        emptyTitle="No employees yet"
        emptyMessage="Add an employee profile to begin tracking probation."
      />
    );
  }
  if (page === 'probations') {
    const columns: Column<Probation>[] = [
      {
        label: 'Employee',
        render: (p) => (
          <Person
            name={fullName(employeeFor(p, data))}
            secondary={`${employeeFor(p, data)?.employeeNumber ?? ''} · Record #${p.id}`}
          />
        ),
      },
      { label: 'Start date', render: (p) => displayDate(p.startDate) },
      {
        label: 'Expected end',
        render: (p) => (
          <>
            <div>{displayDate(p.expectedEndDate)}</div>
            {p.isActive && (
              <span
                className={`cell-secondary ${daysUntil(p.expectedEndDate) < 0 ? 'text-danger' : ''}`}
              >
                {daysUntil(p.expectedEndDate) < 0
                  ? 'Past expected end date'
                  : `${daysUntil(p.expectedEndDate)} days remaining`}
              </span>
            )}
          </>
        ),
      },
      {
        label: 'Status',
        render: (p) => (
          <div className="badge-stack">
            <Badge value={p.status} />
            {!p.isActive && p.status !== 'COMPLETED' && (
              <Badge value="INACTIVE" />
            )}
          </div>
        ),
      },
      {
        label: 'Actions',
        render: (p) => (
          <Actions>
            <Action
              onClick={() => open({ kind: 'probationDetails', record: p })}
            >
              View
            </Action>
            {p.isActive && p.status === 'UNDER_PROBATION' && (
              <Action
                onClick={() =>
                  open({ kind: 'schedule', probationId: String(p.id) })
                }
              >
                Schedule
              </Action>
            )}
            {editableProbation(p, data) && (
              <>
                <Action onClick={() => open({ kind: 'probation', record: p })}>
                  Edit
                </Action>
                <Action
                  danger
                  onClick={() =>
                    open({
                      kind: 'deactivate',
                      entity: 'probation-records',
                      id: String(p.id),
                      name: `probation record #${p.id}`,
                    })
                  }
                >
                  Deactivate
                </Action>
              </>
            )}
          </Actions>
        ),
      },
    ];
    return (
      <Table
        rows={data.probations}
        columns={columns}
        rowKey={key}
        searchText={(p) =>
          `${fullName(employeeFor(p, data))} ${p.id} ${employeeFor(p, data)?.employeeNumber ?? ''}`
        }
        filters={{
          label: 'Statuses',
          value: (p) => p.status,
          options: options([
            'UNDER_PROBATION',
            'FOR_EVALUATION',
            'FOR_HR_REVIEW',
            'COMPLETED',
          ]),
        }}
        emptyTitle="No probation records yet"
        emptyMessage="Create a probation period for an active probationary employee."
      />
    );
  }
  if (page === 'evaluations') {
    const columns: Column<Evaluation>[] = [
      {
        label: actor.role === 'EMPLOYEE' ? 'Evaluation' : 'Employee',
        render: (e) => (
          <Person
            name={
              employeeFor(e, data)
                ? fullName(employeeFor(e, data))
                : `Probation record #${e.probationRecordId}`
            }
            secondary={`Evaluation ${e.sequenceNumber} · ID ${e.id}`}
          />
        ),
      },
      { label: 'Scheduled date', render: (e) => displayDate(e.scheduledDate) },
      { label: 'Status', render: (e) => <Badge value={e.status} /> },
      {
        label: 'Overall score',
        render: (e) =>
          e.overallScore ? (
            <strong>
              {e.overallScore}
              <span className="cell-secondary"> / 5</span>
            </strong>
          ) : (
            <span className="text-secondary">Not submitted</span>
          ),
      },
      {
        label: 'Recommendation',
        render: (e) => (e.recommendation ? label(e.recommendation) : '—'),
      },
      {
        label: 'Actions',
        render: (e) => (
          <Actions>
            <Action onClick={() => open({ kind: 'evaluation', record: e })}>
              {actor.role === 'SUPERVISOR' && e.status !== 'SUBMITTED'
                ? 'Complete'
                : 'View'}
            </Action>
            {actor.role === 'HR_ADMIN' &&
              availableDecisions(data).some((item) =>
                sameId(item.id, e.id),
              ) && (
                <Action
                  onClick={() =>
                    open({ kind: 'decision', evaluationId: String(e.id) })
                  }
                >
                  Record decision
                </Action>
              )}
          </Actions>
        ),
      },
    ];
    return (
      <Table
        rows={data.evaluations}
        columns={columns}
        rowKey={key}
        searchText={(e) =>
          `${fullName(employeeFor(e, data))} ${e.id} ${e.probationRecordId} ${employeeFor(e, data)?.employeeNumber ?? ''}`
        }
        filters={{
          label: 'Statuses',
          value: (e) => e.status,
          options: options(['SCHEDULED', 'DRAFT', 'SUBMITTED']),
        }}
        emptyTitle="No evaluations available"
        emptyMessage={
          actor.role === 'HR_ADMIN'
            ? 'Schedule an evaluation for an active probation record.'
            : actor.role === 'SUPERVISOR'
              ? 'Your assigned evaluations will appear here.'
              : 'Your evaluations will appear here after your supervisor submits them.'
        }
      />
    );
  }
  if (page === 'decisions') {
    const columns: Column<Decision>[] = [
      {
        label: 'Employee',
        render: (d) => (
          <Person
            name={
              employeeFor(d, data)
                ? fullName(employeeFor(d, data))
                : `Probation record #${d.probationRecordId}`
            }
            secondary={`Decision #${d.id}`}
          />
        ),
      },
      { label: 'Decision', render: (d) => <Badge value={d.decision} /> },
      { label: 'Decision date', render: (d) => displayDate(d.decisionDate) },
      { label: 'Evaluation', render: (d) => `#${d.evaluationId}` },
      { label: 'New end date', render: (d) => displayDate(d.newEndDate) },
      {
        label: 'Actions',
        render: (d) => (
          <Action onClick={() => open({ kind: 'decisionDetails', record: d })}>
            View details
          </Action>
        ),
      },
    ];
    return (
      <Table
        rows={data.decisions}
        columns={columns}
        rowKey={key}
        searchText={(d) =>
          `${fullName(employeeFor(d, data))} ${d.id} ${d.evaluationId} ${d.remarks ?? ''}`
        }
        filters={{
          label: 'Decisions',
          value: (d) => d.decision,
          options: options(['REGULARIZED', 'EXTENDED', 'NOT_REGULARIZED']),
        }}
        emptyTitle="No HR decisions yet"
        emptyMessage="Decisions will appear here after HR reviews a submitted evaluation."
      />
    );
  }
  const columns: Column<Account>[] = [
    {
      label: 'Account',
      render: (u) => <Person name={u.email} secondary={`User ID ${u.id}`} />,
    },
    { label: 'Role', render: (u) => label(u.role) },
    {
      label: 'Employee profile',
      render: (u) => {
        const employee = data.employees.find((e) => sameId(e.userId, u.id));
        return employee ? (
          fullName(employee)
        ) : (
          <span className="text-secondary">Not linked</span>
        );
      },
    },
    {
      label: 'Status',
      render: (u) => <Badge value={u.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      label: 'Actions',
      render: (u) => (
        <Actions>
          {u.isActive && (
            <Action onClick={() => open({ kind: 'user', record: u })}>
              Edit
            </Action>
          )}
          {u.isActive && !sameId(u.id, actor.id) && (
            <Action
              danger
              onClick={() =>
                open({
                  kind: 'deactivate',
                  entity: 'users',
                  id: String(u.id),
                  name: u.email,
                })
              }
            >
              Deactivate
            </Action>
          )}
          {sameId(u.id, actor.id) && (
            <span className="cell-secondary">Your account</span>
          )}
        </Actions>
      ),
    },
  ];
  return (
    <Table
      rows={data.users}
      columns={columns}
      rowKey={key}
      searchText={(u) => `${u.email} ${label(u.role)} ${u.id}`}
      filters={{
        label: 'Account statuses',
        value: (u) => (u.isActive ? 'ACTIVE' : 'INACTIVE'),
        options: options(['ACTIVE', 'INACTIVE']),
      }}
      emptyTitle="No user accounts"
      emptyMessage="Create accounts for HR, supervisors, and employees."
    />
  );
}
