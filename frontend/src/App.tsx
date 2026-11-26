import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  IconLayoutDashboard,
  IconUsers,
  IconCalendarStats,
  IconClipboardCheck,
  IconFileCheck,
  IconUserCog,
  IconLogout,
  IconMenu2,
  IconRefresh,
  IconClipboardText,
  IconEye,
  IconEyeOff,
  IconCheck,
  IconX,
} from '@tabler/icons-react';
import {
  api,
  hasSession,
  loadRecords,
  setSession,
  type LoginResponse,
} from './api';
import { Alert } from './components';
import {
  emptyRecords,
  label,
  pageNames,
  pagesFor,
  today,
  displayDate,
  type Account,
  type Page,
  type Records,
} from './domain';
import { EditorDialog, type Editor, type Save } from './editors';
import { descriptions, PageActions, RecordPage } from './pages';

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark">
        <IconClipboardText size={25} stroke={1.7} />
      </span>
      <div>
        <strong>Employee Probation</strong>
        <span>Management System</span>
      </div>
    </div>
  );
}
function Login({
  onLogin,
  message,
}: {
  onLogin: (user: Account) => void;
  message: string;
}) {
  useEffect(() => {
    document.title = 'Sign in | Employee Probation';
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await api<LoginResponse>('/auth/login', 'POST', {
        email: email.trim(),
        password,
      });
      setSession(response.access_token);
      setPassword('');
      onLogin(response.user);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <aside className="login-intro">
        <Brand light />
        <div className="login-intro-content">
          <span className="eyebrow">EMPLOYEE DEVELOPMENT</span>
          <h1>A clear path through probation.</h1>
          <p>
            Keep employee records, performance reviews, and HR decisions
            together.
          </p>
          <div className="login-workflow">
            <div>
              <IconUsers size={21} />
              <span>Organize employee records</span>
            </div>
            <div>
              <IconClipboardCheck size={21} />
              <span>Complete supervisor evaluations</span>
            </div>
            <div>
              <IconFileCheck size={21} />
              <span>Record and review HR decisions</span>
            </div>
          </div>
        </div>
        <span className="login-intro-footer">
          Employee Probation Management System
        </span>
      </aside>
      <main className="login-main">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <span className="eyebrow">ACCOUNT ACCESS</span>
          <h2>Sign in</h2>
          <p className="login-subtitle">
            Enter your account details to continue.
          </p>
          {message && (
            <div className="alert alert-info" role="status">
              {message}
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          <form onSubmit={submit}>
            <label className="form-field">
              <span className="form-label">Email address</span>
              <input
                className="form-control"
                type="email"
                autoComplete="username"
                required
                maxLength={255}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <div className="form-field">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <span className="password-field">
                <input
                  id="login-password"
                  className="form-control"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <IconEyeOff size={19} /> : <IconEye size={19} />}
                </button>
              </span>
            </div>
            <button
              className="btn btn-primary login-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="login-help">
            Need an account? Contact your HR administrator.
          </p>
        </div>
        <footer className="login-footer">
          Employee records · Evaluations · HR decisions
        </footer>
      </main>
    </div>
  );
}
const icons = {
  dashboard: IconLayoutDashboard,
  employees: IconUsers,
  probations: IconCalendarStats,
  evaluations: IconClipboardCheck,
  decisions: IconFileCheck,
  users: IconUserCog,
};
export function App() {
  const [actor, setActor] = useState<Account | null>(null);
  const [checking, setChecking] = useState(hasSession);
  const [sessionMessage, setSessionMessage] = useState('');
  const [sessionError, setSessionError] = useState('');
  const verify = useCallback(async () => {
    if (!hasSession()) {
      setChecking(false);
      return;
    }
    setChecking(true);
    setSessionError('');
    try {
      setActor(await api<Account>('/auth/me'));
    } catch (error) {
      if (hasSession())
        setSessionError(
          error instanceof Error
            ? error.message
            : 'Unable to verify your account.',
        );
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void verify();
  }, [verify]);
  useEffect(() => {
    const expired = () => {
      setActor(null);
      setSessionMessage('Your session has ended. Please sign in again.');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  const logout = () => {
    setSession('');
    setActor(null);
    setSessionError('');
    setSessionMessage('');
    window.location.hash = '';
  };
  if (checking)
    return (
      <main className="loading-page" role="status">
        <Brand />
        <p>Checking your session…</p>
      </main>
    );
  if (!actor && sessionError)
    return (
      <main className="loading-page">
        <Brand />
        <Alert onRetry={() => void verify()}>{sessionError}</Alert>
        <button className="btn" onClick={logout}>
          Back to sign in
        </button>
      </main>
    );
  if (!actor)
    return (
      <Login
        message={sessionMessage}
        onLogin={(user) => {
          setActor(user);
          setSessionMessage('');
        }}
      />
    );
  return (
    <Workspace
      key={`${actor.id}-${actor.role}`}
      actor={actor}
      onActor={setActor}
      logout={logout}
    />
  );
}
function Workspace({
  actor,
  onActor,
  logout,
}: {
  actor: Account;
  onActor: (actor: Account) => void;
  logout: () => void;
}) {
  const [data, setData] = useState<Records>(emptyRecords);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  const request = useRef(0);
  const allowed = pagesFor(actor.role);
  const page = allowed.includes(hash as Page) ? (hash as Page) : 'dashboard';
  const navigate = (next: Page) => {
    window.location.hash = next;
    setMobileMenu(false);
  };
  useEffect(() => {
    const change = () => {
      setHash(window.location.hash.slice(1));
      setMobileMenu(false);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.title = `${pageNames[page]} | Employee Probation`;
  }, [page]);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError('');
    try {
      const profile = await api<Account>('/auth/me');
      if (current !== request.current) return;
      if (profile.role !== actor.role) {
        onActor(profile);
        return;
      }
      const records = await loadRecords(profile.role);
      if (current === request.current) {
        setData(records);
        setLoaded(true);
      }
    } catch (error) {
      if (current === request.current)
        setError(
          error instanceof Error ? error.message : 'Unable to load records.',
        );
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [actor.role, onActor]);
  useEffect(() => {
    void refresh();
    return () => {
      request.current++;
    };
  }, [refresh]);
  const save: Save = async (path, method, body, message) => {
    if (
      path.endsWith('/submit') &&
      body &&
      typeof body === 'object' &&
      'draft' in body
    ) {
      await api(path.replace(/\/submit$/, ''), 'PATCH', body.draft);
      await api(path, 'POST');
    } else {
      await api(path, method, body);
    }
    setEditor(null);
    setNotice(message);
    await refresh();
  };
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <Brand light />
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {allowed.map((item) => {
            const Icon = icons[item];
            return (
              <a
                key={item}
                href={`#${item}`}
                aria-current={page === item ? 'page' : undefined}
                className={`nav-item ${page === item ? 'active' : ''}`}
                onClick={() => setMobileMenu(false)}
              >
                <Icon size={21} stroke={1.6} />
                <span>{pageNames[item]}</span>
                {item === 'decisions' &&
                  actor.role === 'HR_ADMIN' &&
                  loaded &&
                  data.probations.some(
                    (p) => p.status === 'FOR_HR_REVIEW' && p.isActive,
                  ) && (
                    <span className="nav-count">
                      {
                        data.probations.filter(
                          (p) => p.status === 'FOR_HR_REVIEW' && p.isActive,
                        ).length
                      }
                    </span>
                  )}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-role">{label(actor.role)}</span>
          <p>
            Employee development,
            <br />
            one review at a time.
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-toggle"
              onClick={() => setMobileMenu((v) => !v)}
              aria-label="Toggle navigation"
            >
              <IconMenu2 size={23} />
            </button>
            <span>HR workspace</span>
            <span className="topbar-divider" />
            <span className="topbar-date">{displayDate(today())}</span>
          </div>
          <div className="account-menu">
            <span className="account-avatar" aria-hidden="true">
              {actor.email[0]?.toUpperCase()}
            </span>
            <div className="account-identity">
              <strong>{actor.email}</strong>
              <span>{label(actor.role)}</span>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
            >
              <IconLogout size={21} />
            </button>
          </div>
        </header>
        <main className="main-content" id="main-content">
          <div className="page-header">
            <div>
              <span className="eyebrow">
                {actor.role === 'EMPLOYEE'
                  ? 'MY WORKSPACE'
                  : 'EMPLOYEE PROBATION'}
              </span>
              <h1>{pageNames[page]}</h1>
              <p>
                {actor.role === 'EMPLOYEE' && page === 'evaluations'
                  ? 'View your submitted evaluations and supervisor feedback.'
                  : actor.role === 'SUPERVISOR' && page === 'evaluations'
                    ? 'Complete the performance reviews assigned to you.'
                    : descriptions[page]}
              </p>
            </div>
            <div className="page-actions">
              <button
                className="btn refresh-button"
                onClick={() => void refresh()}
                disabled={loading}
                aria-label="Refresh records"
              >
                <IconRefresh size={18} className={loading ? 'spin' : ''} />
                <span>Refresh</span>
              </button>
              {loaded && !error && (
                <PageActions page={page} actor={actor} open={setEditor} />
              )}
            </div>
          </div>
          {notice && (
            <div className="alert alert-success notice" role="status">
              <IconCheck size={20} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                <IconX size={18} />
              </button>
            </div>
          )}
          {error && <Alert onRetry={() => void refresh()}>{error}</Alert>}
          {loading && !loaded ? (
            <div className="card loading-records" role="status">
              <span className="spinner-border spinner-border-sm" />
              Loading your records…
            </div>
          ) : loaded && !error ? (
            <div
              className={loading ? 'records-refreshing' : ''}
              aria-busy={loading}
            >
              <RecordPage
                key={page}
                page={page}
                data={data}
                actor={actor}
                open={setEditor}
                navigate={navigate}
              />
            </div>
          ) : null}
        </main>
        <footer className="workspace-footer">
          <span>Employee Probation Management System</span>
          <span>{label(actor.role)} workspace</span>
        </footer>
      </div>
      {editor && (
        <EditorDialog
          editor={editor}
          data={data}
          actor={actor}
          save={save}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
