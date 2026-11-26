import { emptyRecords, type Account, type Records, type Role } from './domain';

const storageKey = 'epms.session';
let token = '';
try {
  token = sessionStorage.getItem(storageKey) ?? '';
} catch {
  /* Memory-only login if browser storage is unavailable. */
}
export const hasSession = () => Boolean(token);
export function setSession(value: string) {
  token = value;
  try {
    if (value) sessionStorage.setItem(storageKey, value);
    else sessionStorage.removeItem(storageKey);
  } catch {
    /* Login remains available for this page. */
  }
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const requestToken = token;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    if (requestToken !== token)
      throw new ApiError('Your session changed. Please try again.', 401);
    if (!response.ok) {
      if (response.status === 401 && requestToken && path !== '/auth/login') {
        setSession('');
        window.dispatchEvent(new Event('session-expired'));
      }
      const message = Array.isArray(payload?.message)
        ? payload.message.join('. ')
        : payload?.message;
      throw new ApiError(
        message ??
          (response.status >= 500
            ? 'The server could not complete the request. Check that the backend and MySQL are running.'
            : 'The request could not be completed.'),
        response.status,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'The server took too long to respond. Check that the backend and MySQL are running.'
        : 'Cannot reach the server. Start the backend, then try again.',
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
export interface LoginResponse {
  access_token: string;
  user: Account;
}
export async function loadRecords(role: Role): Promise<Records> {
  const [evaluations, decisions] = await Promise.all([
    api<Records['evaluations']>('/evaluations'),
    api<Records['decisions']>('/regularization-decisions'),
  ]);
  if (role !== 'HR_ADMIN') return { ...emptyRecords, evaluations, decisions };
  const [employees, probations, users] = await Promise.all([
    api<Records['employees']>('/employees'),
    api<Records['probations']>('/probation-records'),
    api<Records['users']>('/users'),
  ]);
  return { employees, probations, users, evaluations, decisions };
}
