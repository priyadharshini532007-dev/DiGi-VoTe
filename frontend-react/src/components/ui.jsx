import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './icons.jsx';

export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

const BUTTON_VARIANTS = {
  primary: 'bg-brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(59,91,255,0.7)] hover:brightness-110 disabled:bg-slate-300 disabled:[background-image:none] disabled:shadow-none',
  secondary: 'border border-brand-hover/60 bg-panel/40 text-navy-800 hover:bg-panel-2 disabled:border-slate-300 disabled:text-slate-400',
  danger: 'bg-danger text-white hover:bg-danger-hover disabled:bg-slate-300',
  ghost: 'text-navy-700 hover:bg-panel-2 disabled:text-slate-400',
};

export function Button({ variant = 'primary', size = 'md', busy, className, children, ...props }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' };
  return (
    <button
      type="button"
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition',
        'disabled:cursor-not-allowed', BUTTON_VARIANTS[variant], sizes[size], className)}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small, label }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span className={cx('animate-spin rounded-full border-2 border-current border-t-transparent',
        small ? 'h-3.5 w-3.5' : 'h-5 w-5')} />
      {label && <span className="text-sm text-slate-600">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center py-12 text-navy-700">
      <Spinner label={label} />
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }) {
  return (
    <section className={cx('glow-card rounded-xl', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          {title && <h2 className="text-lg font-semibold text-navy-900">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

/** Page title banner: the compact form of the dashboard hero, used by every inner page. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="glow-card relative isolate mb-6 overflow-hidden rounded-2xl px-6 py-5 sm:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3"
        style={{ backgroundImage: 'radial-gradient(420px 160px at 85% 30%, rgba(59,130,246,0.28), transparent 70%), radial-gradient(360px 140px at 60% 120%, rgba(139,92,246,0.25), transparent 70%)' }} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-700">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Alert({ kind = 'info', title, children, onClose }) {
  const styles = {
    info: 'border-line bg-panel-2 text-navy-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  };
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('rounded-md border px-4 py-3 text-sm', styles[kind])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-current opacity-60 hover:opacity-100" aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <Alert kind="error" title="Could not load this page">
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-panel/60 px-6 py-10 text-center">
      <p className="font-medium text-navy-900">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const BADGE_TONES = {
  gray: 'bg-slate-100 text-slate-700',
  blue: 'bg-accent-soft text-navy-800',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  purple: 'bg-violet-100 text-violet-800',
};

const TONE_GLYPH = { green: '✓', amber: '!', red: '✕', blue: 'i', purple: '•', gray: '•' };

export function Badge({ tone = 'gray', children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-white/5', BADGE_TONES[tone])}>
      <span aria-hidden="true" className="text-[10px] leading-none">{TONE_GLYPH[tone]}</span>
      {children}
    </span>
  );
}

const STATUS_TONES = {
  DRAFT: 'gray', REGISTRATION: 'blue', CAMPAIGN: 'purple', VOTING: 'green', VERIFICATION: 'amber',
  PUBLISHED: 'blue', ARCHIVED: 'gray', ACTIVE: 'green', INVITED: 'amber', SUSPENDED: 'red', REMOVED: 'gray',
  SUBMITTED: 'amber', APPROVED: 'green', REJECTED: 'red', CORRECTION_REQUESTED: 'amber', WITHDRAWN: 'gray',
  PASS: 'green', FAIL: 'red', WARN: 'amber', NOT_RUN: 'gray', ELIGIBLE: 'green', GENERATED: 'amber',
  BALLOT_RECORDED: 'green', INCLUDED_IN_TALLY: 'green', RECEIPT_RECOGNIZED: 'blue', INVALID_RECEIPT: 'red',
  RECEIPT_NOT_FOUND: 'red', VERIFICATION_UNAVAILABLE: 'red', LOW: 'gray', MEDIUM: 'amber', HIGH: 'red',
  VERIFIED: 'green', ATTENTION_REQUIRED: 'amber', INTEGRITY_FAILURE: 'red', ACCEPTED_PENDING_PUBLICATION: 'amber',
  OPEN: 'green', CLOSED: 'gray', READY: 'green', NOT_READY: 'amber', INACTIVE: 'gray', NEEDS_ATTENTION: 'amber',
  ELECTION: 'blue', PARTICIPATION: 'blue', HEALTH: 'purple', AUDIT: 'gray', SECURITY: 'amber',
};

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] ?? 'gray'}>{String(status ?? '—').replaceAll('_', ' ')}</Badge>;
}

const TONE_TEXT = { red: 'text-red-700', amber: 'text-amber-700', green: 'text-emerald-700' };
const TONE_BORDER = { red: 'border-red-200', amber: 'border-amber-200', green: 'border-emerald-200' };

/** Gradient pairs for the rounded icon tiles used by stat cards and quick actions. */
export const ACCENTS = {
  blue: ['#1d4ed8', '#3b82f6'],
  purple: ['#6d28d9', '#a855f7'],
  cyan: ['#0e7490', '#22d3ee'],
  green: ['#047857', '#22c55e'],
  orange: ['#c2410c', '#f59e0b'],
  red: ['#b91c1c', '#f43f5e'],
};
const ACCENT_ORDER = ['blue', 'purple', 'cyan', 'green', 'orange', 'red'];
const ICON_ACCENT = {
  ballot: 'blue', building: 'blue', dashboard: 'blue', calendar: 'blue', archive: 'purple', users: 'purple', person: 'purple',
  flag: 'cyan', clock: 'cyan', chart: 'cyan', speed: 'cyan', checkCircle: 'green', check: 'green', shield: 'green',
  qr: 'green', bell: 'orange', document: 'orange', warning: 'orange', error: 'red', lock: 'purple', image: 'orange',
};

export function accentFor(icon, accent) {
  const key = accent ?? ICON_ACCENT[icon] ?? ACCENT_ORDER[0];
  return ACCENTS[key] ?? ACCENTS.blue;
}

/** Rounded gradient tile holding an icon. */
export function IconTile({ icon, accent, size = 'md' }) {
  const [from, to] = accentFor(icon, accent);
  const dim = size === 'sm' ? 'h-10 w-10 rounded-lg' : 'h-12 w-12 rounded-xl';
  return (
    <span className={cx('grid shrink-0 place-items-center text-white shadow-lg', dim)}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 6px 18px -8px ${to}` }}>
      <Icon name={icon} className={size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} />
    </span>
  );
}

/** Statistic tile. `to` makes the whole tile a link; do not also put a link inside `hint` then. */
export function StatCard({ label, value, hint, tone, icon, accent, to, loading }) {
  const body = (
    <div className={cx('glow-card flex h-full items-center gap-4 rounded-xl p-4', TONE_BORDER[tone],
      to && 'transition hover:border-brand-hover/60 hover:shadow-lg')}>
      {icon && <IconTile icon={icon} accent={accent} />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {loading
          ? <span className="mt-1 block h-8 w-16 animate-pulse rounded bg-slate-200" role="status" aria-label="Loading" />
          : <p className={cx('mt-0.5 text-2xl font-bold leading-tight', TONE_TEXT[tone] ?? 'text-navy-900')}>{value}</p>}
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
      {to && <Icon name="arrowRight" className="h-5 w-5 shrink-0 text-slate-400" />}
    </div>
  );
  return to ? <Link to={to} className="block h-full rounded-xl">{body}</Link> : body;
}

/** Horizontal progress stepper. steps: [{ key, label, hint?, failed? }]; current: step key. */
export function Stepper({ steps, current, ariaLabel = 'Progress' }) {
  const index = steps.findIndex((s) => s.key === current);
  return (
    <ol aria-label={ariaLabel} className="grid gap-3 sm:flex sm:flex-wrap sm:items-start">
      {steps.map((s, i) => {
        const state = s.failed ? 'failed' : index < 0 ? 'todo' : i < index ? 'done' : i === index ? 'current' : 'todo';
        const styles = {
          done: 'bg-accent-soft text-navy-800',
          current: 'bg-brand text-white',
          failed: 'bg-red-100 text-red-800',
          todo: 'bg-slate-100 text-slate-500',
        };
        return (
          <li key={s.key} aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-2 sm:mr-4">
            <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold', styles[state])}>
              {state === 'done' ? <Icon name="check" className="h-4 w-4" /> : state === 'failed' ? <Icon name="close" className="h-4 w-4" /> : i + 1}
            </span>
            <span>
              <span className={cx('block text-sm font-medium', state === 'todo' ? 'text-slate-500' : 'text-navy-900')}>{s.label}</span>
              {s.hint && <span className="block text-xs text-slate-500">{s.hint}</span>}
              <span className="sr-only">{state === 'done' ? ' (completed)' : state === 'current' ? ' (current)' : state === 'failed' ? ' (needs attention)' : ' (upcoming)'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div className="space-y-2 p-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />)}
    </div>
  );
}

export function AccessDenied({ message = 'Your role does not include this page. The server enforces this independently of the interface.' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-panel px-6 py-10 text-center">
      <p className="text-lg font-semibold text-navy-900">Access denied</p>
      <p className="mt-1 text-sm text-slate-600">{message}</p>
      <Link to="/app" className="mt-4 inline-block text-sm font-medium text-navy-700">Back to your dashboard</Link>
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

const INPUT = 'block w-full rounded-md border border-slate-300 bg-panel px-3 py-2 text-sm shadow-sm focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 disabled:bg-slate-100';

export function Input(props) {
  return <input {...props} className={cx(INPUT, props.className)} />;
}

export function Textarea(props) {
  return <textarea rows={4} {...props} className={cx(INPUT, props.className)} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={cx(INPUT, props.className)}>
      {children}
    </select>
  );
}

export function Checkbox({ label, hint, ...props }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-900" {...props} />
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Table({ columns, rows, rowKey, empty = 'Nothing to show yet.' }) {
  if (!rows?.length) return <p className="px-5 py-8 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-line text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i} className="hover:bg-panel-2">
              {columns.map((c) => (
                <td key={c.key} className={cx('px-4 py-2.5 align-top', c.className)}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4" onMouseDown={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-lg bg-panel shadow-xl focus:outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        </header>
        <div className="px-5 py-4 text-sm text-slate-700">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="mb-5 overflow-x-auto border-b border-line">
      <nav className="-mb-px flex gap-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => onChange(t.key)}
            className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              active === t.key ? 'border-brand-hover text-white' : 'border-transparent text-slate-500 hover:text-white')}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function Hash({ value, len = 16 }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <span className="mono text-xs text-slate-600" title={value}>
      {value.length > len ? `${value.slice(0, len)}…` : value}
    </span>
  );
}

export function DefinitionList({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
