import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Badge, Field, Modal } from './components';
import {
  availableDecisions,
  criteria,
  displayDate,
  employeeFor,
  fullName,
  label,
  sameId,
  today,
  type Account,
  type Decision,
  type Employee,
  type Evaluation,
  type Probation,
  type Records,
} from './domain';

export type Save = (
  path: string,
  method: string,
  body: unknown,
  message: string,
) => Promise<void>;
export type Editor =
  | { kind: 'employee'; record?: Employee }
  | { kind: 'user'; record?: Account }
  | { kind: 'probation'; record?: Probation }
  | { kind: 'schedule'; probationId?: string }
  | { kind: 'evaluation'; record: Evaluation }
  | { kind: 'decision'; evaluationId?: string }
  | {
      kind: 'deactivate';
      entity: 'employees' | 'users' | 'probation-records';
      id: string;
      name: string;
    }
  | { kind: 'employeeDetails'; record: Employee }
  | { kind: 'probationDetails'; record: Probation }
  | { kind: 'decisionDetails'; record: Decision };

function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return {
    busy,
    error,
    onSubmit: async (e: FormEvent) => {
      e.preventDefault();
      if (busy) return;
      setError('');
      setBusy(true);
      try {
        await action();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Unable to save this record.',
        );
      } finally {
        setBusy(false);
      }
    },
  };
}
function Footer({
  onClose,
  busy,
  text = 'Save changes',
}: {
  onClose: () => void;
  busy: boolean;
  text?: string;
}) {
  return (
    <footer className="dialog-footer">
      <button type="button" className="btn" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : text}
      </button>
    </footer>
  );
}
function numericId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error('Choose a valid record.');
  return id;
}
function stringValues(record?: object) {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [
      key,
      value == null ? '' : String(value),
    ]),
  );
}
function RecordForm({
  editor,
  data,
  actor,
  save,
  onClose,
}: {
  editor: Extract<
    Editor,
    { kind: 'employee' | 'user' | 'probation' | 'schedule' }
  >;
  data: Records;
  actor: Account;
  save: Save;
  onClose: () => void;
}) {
  const record = 'record' in editor ? editor.record : undefined;
  const [values, setValues] = useState<Record<string, string>>(() => ({
    role: 'EMPLOYEE',
    ...stringValues(record),
    ...('probationId' in editor
      ? { probationRecordId: editor.probationId ?? '' }
      : {}),
  }));
  const field = (name: string) => ({
    value: values[name] ?? '',
    onChange: (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  const paths = {
    employee: '/employees',
    user: '/users',
    probation: '/probation-records',
    schedule: '/evaluations',
  };
  const names = {
    employee: 'employee',
    user: 'user account',
    probation: 'probation record',
    schedule: 'evaluation',
  };
  const form = useSubmit(async () => {
    let body: Record<string, unknown>;
    if (editor.kind === 'employee') {
      body = Object.fromEntries(
        [
          'employeeNumber',
          'firstName',
          'lastName',
          'department',
          'position',
          'dateHired',
        ].map((key) => [key, (values[key] ?? '').trim()]),
      );
      body.userId = values.userId ? numericId(values.userId) : null;
      body.supervisorId = values.supervisorId
        ? numericId(values.supervisorId)
        : null;
    } else if (editor.kind === 'user') {
      body = { email: (values.email ?? '').trim(), role: values.role };
      if (!record) {
        if (new TextEncoder().encode(values.password ?? '').length > 72)
          throw new Error('Password must not exceed 72 bytes.');
        body.password = values.password;
      }
    } else if (editor.kind === 'probation') {
      body = {
        startDate: values.startDate,
        expectedEndDate: values.expectedEndDate,
      };
      if (!record) body.employeeId = numericId(values.employeeId);
      if (values.expectedEndDate <= values.startDate)
        throw new Error('The end date must be after the start date.');
    } else {
      body = {
        probationRecordId: numericId(values.probationRecordId),
        scheduledDate: values.scheduledDate,
      };
    }
    if (record) {
      const original = record as unknown as Record<string, unknown>;
      body = Object.fromEntries(
        Object.entries(body).filter(
          ([key, value]) => String(value ?? '') !== String(original[key] ?? ''),
        ),
      );
      if (!Object.keys(body).length)
        throw new Error('Make a change before saving.');
    }
    await save(
      `${paths[editor.kind]}${record ? `/${record.id}` : ''}`,
      record ? 'PATCH' : 'POST',
      body,
      `${record ? 'Updated' : 'Created'} ${names[editor.kind]}.`,
    );
  });
  const textInput = (
    name: string,
    text: string,
    maxLength = 100,
    type = 'text',
    extra = {},
  ) => (
    <Field key={name} label={text}>
      <input
        className="form-control"
        {...field(name)}
        type={type}
        required
        maxLength={maxLength}
        {...extra}
      />
    </Field>
  );
  const eligibleEmployees = data.employees.filter(
    (e) =>
      e.isActive &&
      e.employmentStatus === 'PROBATIONARY' &&
      !data.probations.some((p) => p.isActive && sameId(p.employeeId, e.id)),
  );
  const eligiblePeriods = data.probations.filter(
    (p) => p.isActive && p.status === 'UNDER_PROBATION',
  );
  const selectedPeriod = eligiblePeriods.find((p) =>
    sameId(p.id, values.probationRecordId),
  );
  const selectedEmployee = data.employees.find((e) =>
    sameId(e.id, values.employeeId),
  );
  return (
    <Modal
      title={`${record ? 'Edit' : editor.kind === 'schedule' ? 'Schedule' : 'Add'} ${names[editor.kind]}`}
      onClose={onClose}
      busy={form.busy}
    >
      <form onSubmit={form.onSubmit}>
        <div className="dialog-body">
          {form.error && <Alert>{form.error}</Alert>}
          <div className="form-grid">
            {editor.kind === 'employee' && (
              <>
                {textInput('employeeNumber', 'Employee number', 30)}
                {textInput('dateHired', 'Date hired', 100, 'date')}
                {textInput('firstName', 'First name')}
                {textInput('lastName', 'Last name')}
                {textInput('department', 'Department')}
                {textInput('position', 'Position')}
                <Field
                  label="Login account"
                  hint="Optional. Links this profile to an existing account."
                >
                  <select className="form-select" {...field('userId')}>
                    <option value="">No account linked</option>
                    {data.users
                      .filter(
                        (u) =>
                          sameId(u.id, values.userId) ||
                          (u.isActive &&
                            !data.employees.some(
                              (e) =>
                                sameId(e.userId, u.id) &&
                                !sameId(e.id, record?.id),
                            )),
                      )
                      .map((u) => (
                        <option key={u.id} value={String(u.id)}>
                          {u.email} · {label(u.role)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label="Supervisor"
                  hint="Choose a profile linked to an active supervisor account."
                >
                  <select className="form-select" {...field('supervisorId')}>
                    <option value="">Not assigned</option>
                    {data.employees
                      .filter(
                        (e) =>
                          !sameId(e.id, record?.id) &&
                          (sameId(e.id, values.supervisorId) ||
                            (e.isActive &&
                              data.users.some(
                                (u) =>
                                  sameId(u.id, e.userId) &&
                                  u.isActive &&
                                  u.role === 'SUPERVISOR',
                              ))),
                      )
                      .map((e) => (
                        <option key={e.id} value={String(e.id)}>
                          {fullName(e)} · {e.employeeNumber}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            )}
            {editor.kind === 'user' && (
              <>
                {textInput('email', 'Email address', 255, 'email')}
                <Field label="Role">
                  <select
                    className="form-select"
                    {...field('role')}
                    disabled={sameId(record?.id, actor.id)}
                  >
                    {['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'].map((role) => (
                      <option key={role} value={role}>
                        {label(role)}
                      </option>
                    ))}
                  </select>
                </Field>
                {!record && (
                  <Field
                    label="Password"
                    wide
                    hint="At least 12 characters; at most 72 bytes."
                  >
                    <input
                      className="form-control"
                      {...field('password')}
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={72}
                    />
                  </Field>
                )}
              </>
            )}
            {editor.kind === 'probation' && (
              <>
                {!record && (
                  <Field label="Employee" wide>
                    <select
                      className="form-select"
                      {...field('employeeId')}
                      required
                    >
                      <option value="">Choose an employee</option>
                      {eligibleEmployees.map((e) => (
                        <option key={e.id} value={String(e.id)}>
                          {fullName(e)} · {e.employeeNumber}
                        </option>
                      ))}
                    </select>
                    {!eligibleEmployees.length && (
                      <span className="form-hint">
                        An active probationary employee without an active
                        probation record is needed.
                      </span>
                    )}
                  </Field>
                )}
                {textInput('startDate', 'Start date', 100, 'date', {
                  min: selectedEmployee?.dateHired,
                })}
                {textInput(
                  'expectedEndDate',
                  'Expected end date',
                  100,
                  'date',
                  { min: values.startDate },
                )}
              </>
            )}
            {editor.kind === 'schedule' && (
              <>
                <Field label="Probation record" wide>
                  <select
                    className="form-select"
                    {...field('probationRecordId')}
                    required
                  >
                    <option value="">Choose a probation record</option>
                    {eligiblePeriods.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {fullName(employeeFor(p, data))} · Record #{p.id}
                      </option>
                    ))}
                  </select>
                  {!eligiblePeriods.length && (
                    <span className="form-hint">
                      Create a probation record or extend a reviewed period
                      before scheduling.
                    </span>
                  )}
                </Field>
                {textInput('scheduledDate', 'Evaluation date', 100, 'date', {
                  min: selectedPeriod?.startDate,
                  max: selectedPeriod?.expectedEndDate,
                })}
                <p className="form-hint field-wide">
                  The employee needs an assigned supervisor with an active
                  supervisor account. The server assigns the next evaluation
                  number.
                </p>
              </>
            )}
          </div>
        </div>
        <Footer
          onClose={onClose}
          busy={form.busy}
          text={
            record
              ? 'Save changes'
              : editor.kind === 'schedule'
                ? 'Schedule evaluation'
                : `Create ${names[editor.kind]}`
          }
        />
      </form>
    </Modal>
  );
}
function EvaluationForm({
  record,
  data,
  actor,
  save,
  onClose,
}: {
  record: Evaluation;
  data: Records;
  actor: Account;
  save: Save;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    stringValues(record),
  );
  const [confirm, setConfirm] = useState(false);
  const canEdit = actor.role === 'SUPERVISOR' && record.status !== 'SUBMITTED';
  const person = employeeFor(record, data);
  const patch = () =>
    Object.fromEntries([
      ...criteria.map(([key]) => [
        key,
        values[key] ? Number(values[key]) : null,
      ]),
      ['comments', values.comments?.trim() || null],
      ['recommendation', values.recommendation || null],
    ]);
  const form = useSubmit(async () => {
    await save(
      `/evaluations/${record.id}`,
      'PATCH',
      patch(),
      'Evaluation draft saved.',
    );
  });
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const finish = async () => {
    if (sending) return;
    setSending(true);
    setSubmitError('');
    try {
      if (criteria.some(([key]) => !values[key]) || !values.recommendation)
        throw new Error(
          'Complete all seven ratings and choose a recommendation before submitting.',
        );
      // The submission form asks its caller to save the draft and then submit it.
      await save(
        `/evaluations/${record.id}/submit`,
        'POST',
        { draft: patch() },
        'Evaluation submitted for HR review.',
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to submit evaluation.',
      );
      setConfirm(false);
    } finally {
      setSending(false);
    }
  };
  const busy = form.busy || sending;
  return (
    <Modal
      title={`${canEdit ? 'Complete' : 'View'} evaluation #${record.id}`}
      onClose={onClose}
      busy={busy}
      wide
    >
      <form onSubmit={form.onSubmit}>
        <div className="dialog-body">
          <div className="record-heading">
            <div>
              <h3>
                {person
                  ? fullName(person)
                  : `Probation record #${record.probationRecordId}`}
              </h3>
              <p>
                Evaluation {record.sequenceNumber} · Scheduled{' '}
                {displayDate(record.scheduledDate)}
              </p>
            </div>
            <Badge value={record.status} />
          </div>
          {(form.error || submitError) && (
            <Alert>{form.error || submitError}</Alert>
          )}
          <p className="rating-guide">
            1 — Needs improvement · 2 — Below expectations · 3 — Meets
            expectations · 4 — Above expectations · 5 — Excellent
          </p>
          <fieldset disabled={!canEdit || busy} className="rating-fieldset">
            <legend className="visually-hidden">Performance ratings</legend>
            {criteria.map(([key, text]) => (
              <div className="rating-row" key={key}>
                <span id={`rating-${key}`}>{text}</span>
                <div
                  className="rating-options"
                  role="group"
                  aria-labelledby={`rating-${key}`}
                >
                  {[1, 2, 3, 4, 5].map((score) => (
                    <label
                      className={`rating-option ${values[key] === String(score) ? 'selected' : ''}`}
                      key={score}
                    >
                      <input
                        type="radio"
                        name={key}
                        value={score}
                        checked={values[key] === String(score)}
                        onChange={() =>
                          setValues((v) => ({ ...v, [key]: String(score) }))
                        }
                      />
                      <span>{score}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          <div className="form-grid mt-4">
            <Field label="Recommendation">
              <select
                className="form-select"
                disabled={!canEdit || busy}
                value={values.recommendation ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, recommendation: e.target.value }))
                }
              >
                <option value="">Choose a recommendation</option>
                {['REGULARIZE', 'EXTEND', 'DO_NOT_REGULARIZE'].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="score-summary">
              <span>Overall score</span>
              <strong>
                {record.status === 'SUBMITTED'
                  ? record.overallScore
                  : criteria.every(([key]) => values[key])
                    ? (
                        criteria.reduce(
                          (sum, [key]) => sum + Number(values[key]),
                          0,
                        ) / 7
                      ).toFixed(2)
                    : '—'}
                <small> / 5</small>
              </strong>
              {canEdit && (
                <span className="form-hint">
                  Preview; calculated by the server on submission.
                </span>
              )}
            </div>
            <Field label="Comments" wide>
              <textarea
                className="form-control"
                rows={4}
                maxLength={5000}
                disabled={!canEdit || busy}
                value={values.comments ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, comments: e.target.value }))
                }
              />
            </Field>
          </div>
          {record.status === 'SUBMITTED' && (
            <p className="form-hint mt-3">
              Submitted {displayDate(record.submittedAt)}. Submitted evaluations
              are read-only.
            </p>
          )}
          {confirm && (
            <div className="confirm-panel" role="alert">
              <strong>Submit this evaluation?</strong>
              <p>
                The ratings and recommendation will be locked and sent to HR for
                review.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void finish()}
              >
                {sending ? 'Submitting…' : 'Confirm submission'}
              </button>
              <button
                type="button"
                className="btn ms-2"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Keep editing
              </button>
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && !confirm && (
            <>
              <button type="submit" className="btn" disabled={busy}>
                Save draft
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  busy ||
                  criteria.some(([key]) => !values[key]) ||
                  !values.recommendation
                }
                onClick={() => setConfirm(true)}
              >
                Submit evaluation
              </button>
            </>
          )}
        </footer>
      </form>
    </Modal>
  );
}
function DecisionForm({
  data,
  evaluationId,
  save,
  onClose,
}: {
  data: Records;
  evaluationId?: string;
  save: Save;
  onClose: () => void;
}) {
  const [values, setValues] = useState({
    evaluationId: evaluationId ?? '',
    decision: 'REGULARIZED',
    decisionDate: today(),
    newEndDate: '',
    remarks: '',
  });
  const [confirmed, setConfirmed] = useState(false);
  const options = availableDecisions(data);
  const evaluation = options.find((e) => sameId(e.id, values.evaluationId));
  const probation = data.probations.find((p) =>
    sameId(p.id, evaluation?.probationRecordId),
  );
  const field = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      setConfirmed(false);
    },
  });
  const form = useSubmit(async () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    await save(
      '/regularization-decisions',
      'POST',
      {
        evaluationId: numericId(values.evaluationId),
        decision: values.decision,
        decisionDate: values.decisionDate,
        remarks: values.remarks.trim() || null,
        ...(values.decision === 'EXTENDED'
          ? { newEndDate: values.newEndDate }
          : {}),
      },
      'HR decision recorded. Employee and probation statuses updated.',
    );
  });
  return (
    <Modal title="Record HR decision" onClose={onClose} busy={form.busy}>
      <form onSubmit={form.onSubmit}>
        <div className="dialog-body">
          {form.error && <Alert>{form.error}</Alert>}
          <div className="form-grid">
            <Field label="Submitted evaluation" wide>
              <select
                className="form-select"
                {...field('evaluationId')}
                required
              >
                <option value="">
                  Choose an evaluation awaiting HR review
                </option>
                {options.map((e) => (
                  <option key={e.id} value={String(e.id)}>
                    {fullName(employeeFor(e, data))} · Evaluation #{e.id} ·{' '}
                    {e.overallScore}/5
                  </option>
                ))}
              </select>
              {!options.length && (
                <span className="form-hint">
                  No submitted evaluations are currently awaiting a decision.
                </span>
              )}
            </Field>
            {evaluation && (
              <div className="info-panel field-wide">
                Supervisor recommendation:{' '}
                <strong>{label(evaluation.recommendation)}</strong>
                <br />
                Current probation end: {displayDate(probation?.expectedEndDate)}
                {evaluation.comments && (
                  <p className="mt-2 mb-0">{evaluation.comments}</p>
                )}
              </div>
            )}
            <Field label="Decision">
              <select className="form-select" {...field('decision')}>
                {['REGULARIZED', 'EXTENDED', 'NOT_REGULARIZED'].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decision date" hint="Dates follow Asia/Manila time.">
              <input
                className="form-control"
                type="date"
                {...field('decisionDate')}
                max={today()}
                min={
                  evaluation?.submittedAt
                    ? new Intl.DateTimeFormat('en-CA', {
                        timeZone: 'Asia/Manila',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      }).format(new Date(evaluation.submittedAt))
                    : probation?.startDate
                }
                required
              />
            </Field>
            {values.decision === 'EXTENDED' && (
              <Field
                label="New probation end date"
                wide
                hint="Must be after the current end date and the decision date."
              >
                <input
                  className="form-control"
                  type="date"
                  {...field('newEndDate')}
                  min={probation?.expectedEndDate}
                  required
                />
              </Field>
            )}
            <Field label="Remarks" wide>
              <textarea
                className="form-control"
                rows={4}
                maxLength={5000}
                {...field('remarks')}
              />
            </Field>
            {confirmed && (
              <div className="confirm-panel field-wide" role="alert">
                <strong>Confirm: {label(values.decision)}</strong>
                <p>
                  {values.decision === 'EXTENDED'
                    ? 'The probation period will be extended for another evaluation.'
                    : `The probation period will close and the employee will be marked ${values.decision === 'REGULARIZED' ? 'regular' : 'separated'}.`}{' '}
                  This decision cannot be edited after saving.
                </p>
              </div>
            )}
          </div>
        </div>
        <Footer
          onClose={onClose}
          busy={form.busy}
          text={confirmed ? 'Confirm and record decision' : 'Review decision'}
        />
      </form>
    </Modal>
  );
}
function Details({
  editor,
  data,
  onClose,
}: {
  editor: Extract<
    Editor,
    { kind: 'employeeDetails' | 'probationDetails' | 'decisionDetails' }
  >;
  data: Records;
  onClose: () => void;
}) {
  const record = editor.record;
  const employee =
    editor.kind === 'employeeDetails'
      ? editor.record
      : employeeFor(editor.record, data);
  const periods =
    editor.kind === 'employeeDetails'
      ? data.probations.filter((p) => sameId(p.employeeId, record.id))
      : editor.kind === 'probationDetails'
        ? [editor.record]
        : data.probations.filter((p) =>
            sameId(p.id, editor.record.probationRecordId),
          );
  const evaluations = data.evaluations.filter((e) =>
    periods.some((p) => sameId(p.id, e.probationRecordId)),
  );
  const decisions =
    editor.kind === 'decisionDetails'
      ? [editor.record]
      : data.decisions.filter((d) =>
          periods.some((p) => sameId(p.id, d.probationRecordId)),
        );
  const detail = (title: string, value: ReactNode) => (
    <div key={title}>
      <dt>{title}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <Modal
      title={
        editor.kind === 'decisionDetails'
          ? `HR decision #${record.id}`
          : editor.kind === 'probationDetails'
            ? `Probation record #${record.id}`
            : 'Employee details'
      }
      onClose={onClose}
      wide
    >
      <div className="dialog-body">
        <div className="record-heading">
          <div>
            <h3>{fullName(employee)}</h3>
            <p>
              {employee
                ? `${employee.employeeNumber} · ${employee.position}`
                : `Probation record #${(record as Decision).probationRecordId}`}
            </p>
          </div>
          {employee && <Badge value={employee.employmentStatus} />}
        </div>
        {employee && (
          <dl className="detail-grid">
            {detail('Department', employee.department)}
            {detail('Date hired', displayDate(employee.dateHired))}
            {detail(
              'Account status',
              <Badge value={employee.isActive ? 'ACTIVE' : 'INACTIVE'} />,
            )}
            {detail(
              'Supervisor',
              employee.supervisorId
                ? data.employees.some((e) =>
                    sameId(e.id, employee.supervisorId),
                  )
                  ? fullName(
                      data.employees.find((e) =>
                        sameId(e.id, employee.supervisorId),
                      ),
                    )
                  : `Employee #${employee.supervisorId}`
                : 'Not assigned',
            )}
          </dl>
        )}
        {periods.length > 0 && (
          <>
            <h3 className="section-title">Probation history</h3>
            {periods.map((p) => (
              <div className="history-entry" key={p.id}>
                <div>
                  <strong>Record #{p.id}</strong>
                  <p>
                    {displayDate(p.startDate)} –{' '}
                    {displayDate(p.expectedEndDate)}
                  </p>
                </div>
                <Badge value={p.status} />
              </div>
            ))}
          </>
        )}
        {evaluations.length > 0 && (
          <>
            <h3 className="section-title">Evaluations</h3>
            {evaluations.map((e) => (
              <div className="history-entry" key={e.id}>
                <div>
                  <strong>Evaluation {e.sequenceNumber}</strong>
                  <p>
                    {displayDate(e.scheduledDate)} ·{' '}
                    {e.overallScore ? `${e.overallScore}/5` : 'Awaiting score'}
                  </p>
                </div>
                <Badge value={e.status} />
              </div>
            ))}
          </>
        )}
        <h3 className="section-title">HR decisions</h3>
        {decisions.length ? (
          decisions.map((d) => (
            <div className="decision-entry" key={d.id}>
              <div className="history-entry">
                <div>
                  <strong>{label(d.decision)}</strong>
                  <p>
                    {displayDate(d.decisionDate)} · Evaluation #{d.evaluationId}
                  </p>
                </div>
                <Badge value={d.decision} />
              </div>
              {d.newEndDate && (
                <p>
                  End date changed from {displayDate(d.previousEndDate)} to{' '}
                  {displayDate(d.newEndDate)}.
                </p>
              )}
              {d.remarks && <p className="preserve-lines">{d.remarks}</p>}
            </div>
          ))
        ) : (
          <p className="text-secondary">No HR decisions recorded.</p>
        )}
      </div>
      <footer className="dialog-footer">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </footer>
    </Modal>
  );
}
export function EditorDialog({
  editor,
  data,
  actor,
  save,
  onClose,
}: {
  editor: Editor;
  data: Records;
  actor: Account;
  save: Save;
  onClose: () => void;
}) {
  if (editor.kind === 'evaluation')
    return (
      <EvaluationForm
        record={editor.record}
        data={data}
        actor={actor}
        save={save}
        onClose={onClose}
      />
    );
  if (editor.kind === 'decision')
    return (
      <DecisionForm
        data={data}
        evaluationId={editor.evaluationId}
        save={save}
        onClose={onClose}
      />
    );
  if (
    editor.kind === 'employeeDetails' ||
    editor.kind === 'probationDetails' ||
    editor.kind === 'decisionDetails'
  )
    return <Details editor={editor} data={data} onClose={onClose} />;
  if (editor.kind === 'deactivate')
    return <Deactivate editor={editor} save={save} onClose={onClose} />;
  return (
    <RecordForm
      editor={editor}
      data={data}
      actor={actor}
      save={save}
      onClose={onClose}
    />
  );
}
function Deactivate({
  editor,
  save,
  onClose,
}: {
  editor: Extract<Editor, { kind: 'deactivate' }>;
  save: Save;
  onClose: () => void;
}) {
  const form = useSubmit(() =>
    save(
      `/${editor.entity}/${editor.id}`,
      'DELETE',
      undefined,
      'Record deactivated.',
    ),
  );
  return (
    <Modal title="Deactivate record" onClose={onClose} busy={form.busy}>
      <form onSubmit={form.onSubmit}>
        <div className="dialog-body">
          {form.error && <Alert>{form.error}</Alert>}
          <p>
            Deactivate <strong>{editor.name}</strong>?
          </p>
          <p className="text-secondary">
            The record will become inactive. Its saved history will be retained.
          </p>
        </div>
        <Footer onClose={onClose} busy={form.busy} text="Deactivate" />
      </form>
    </Modal>
  );
}
