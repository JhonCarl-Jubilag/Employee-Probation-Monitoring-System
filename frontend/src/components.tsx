import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  IconX,
  IconSearch,
  IconInbox,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { label } from './domain';

export function Badge({ value }: { value: string }) {
  const color = [
    'ACTIVE',
    'REGULAR',
    'REGULARIZED',
    'SUBMITTED',
    'COMPLETED',
  ].includes(value)
    ? 'green'
    : [
          'INACTIVE',
          'SEPARATED',
          'NOT_REGULARIZED',
          'DO_NOT_REGULARIZE',
        ].includes(value)
      ? 'secondary'
      : ['FOR_HR_REVIEW', 'EXTENDED', 'EXTEND', 'DRAFT'].includes(value)
        ? 'yellow'
        : 'blue';
  return (
    <span className={`badge bg-${color}-lt status-badge`}>{label(value)}</span>
  );
}
export function Alert({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="alert alert-danger" role="alert">
      <div>{children}</div>
      {onRetry && (
        <button
          className="btn btn-sm btn-outline-danger ms-auto"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}
export function Empty({
  title = 'No records yet',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <IconInbox size={34} stroke={1.4} />
      <h3>{title}</h3>
      <p>{children ?? 'Records will appear here when they are available.'}</p>
    </div>
  );
}
export function Field({
  label: text,
  children,
  hint,
  wide,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={`form-field ${wide ? 'field-wide' : ''}`}>
      <span className="form-label">{text}</span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const heading = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`dialog-card ${wide ? 'dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        tabIndex={-1}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
          if (e.key === 'Tab') {
            const elements = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
              ) ?? [],
            );
            const first = elements[0],
              last = elements.at(-1);
            if (!first) {
              e.preventDefault();
              return;
            }
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header className="dialog-header">
          <h2 id={heading}>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <IconX size={21} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
}
export function Table<T>({
  rows,
  columns,
  searchText,
  filters,
  emptyTitle,
  emptyMessage,
  rowKey,
  initialStatus = '',
}: {
  rows: T[];
  columns: Column<T>[];
  searchText: (row: T) => string;
  filters?: {
    label: string;
    value: (row: T) => string;
    options: { value: string; label: string }[];
  };
  emptyTitle?: string;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  initialStatus?: string;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(0);
  const filtered = rows.filter(
    (row) =>
      searchText(row).toLowerCase().includes(query.toLowerCase()) &&
      (!status || filters?.value(row) === status),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages - 1);
  const start = current * 10;
  return (
    <section className="card data-card">
      <div className="table-toolbar">
        <div className="search-field">
          <IconSearch size={19} />
          <input
            className="form-control"
            aria-label="Search records"
            placeholder="Search records…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {filters && (
          <select
            className="form-select filter-select"
            aria-label={filters.label}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All {filters.label.toLowerCase()}</option>
            {filters.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <span className="record-count">
          {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
        </span>
      </div>
      {filtered.length ? (
        <div className="table-responsive">
          <table className="table table-vcenter">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(start, start + 10).map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((c) => (
                    <td key={c.label}>{c.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title={query || status ? 'No matching records' : emptyTitle}>
          {query || status
            ? 'Try another search or change the filter.'
            : emptyMessage}
        </Empty>
      )}
      <footer className="table-footer">
        <span>
          {filtered.length
            ? `${start + 1}–${Math.min(start + 10, filtered.length)} of ${filtered.length}`
            : '0 records'}
        </span>
        <div className="pagination-controls">
          <button
            className="btn btn-sm"
            aria-label="Previous page"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <IconChevronLeft size={17} />
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            className="btn btn-sm"
            aria-label="Next page"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            <IconChevronRight size={17} />
          </button>
        </div>
      </footer>
    </section>
  );
}
export function Person({
  name,
  secondary,
}: {
  name: string;
  secondary?: string;
}) {
  return (
    <div className="person">
      <span className="person-avatar" aria-hidden="true">
        {name
          .split(' ')
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
          .toUpperCase()}
      </span>
      <div>
        <span className="person-name">{name}</span>
        {secondary && <span className="person-secondary">{secondary}</span>}
      </div>
    </div>
  );
}
