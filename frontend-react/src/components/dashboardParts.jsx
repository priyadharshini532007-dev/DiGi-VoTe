import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './icons.jsx';
import { IconTile, cx } from './ui.jsx';

/** Ticks once a second; used for the live clock and countdowns. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const PILL = {
  green: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-brand/25 text-navy-700',
  purple: 'bg-violet-100 text-violet-800',
  amber: 'bg-amber-100 text-amber-800',
  gray: 'bg-slate-100 text-slate-700',
  red: 'bg-red-100 text-red-800',
};

/** Rounded status pill with a leading dot ("● Live"). */
export function Pill({ tone = 'gray', children }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold', PILL[tone] ?? PILL.gray)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

export function ProgressBar({ value, label }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(pct)} aria-label={label}>
        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
          style={{ width: `${pct}%`, backgroundImage: 'linear-gradient(90deg,#2563eb,#7c3aed)' }} />
      </div>
      <span className="w-10 text-xs text-slate-700">{Math.round(pct)}%</span>
    </div>
  );
}

/** Quick-action tile: gradient icon, title, one-line description, optional "not available" state. */
export function ActionTile({ to, icon, accent, title, text, unavailable }) {
  const body = (
    <div className={cx('flex h-full items-center gap-3 rounded-xl border border-line bg-panel/60 p-3 transition',
      to && 'hover:border-brand-hover/60 hover:bg-panel-2')}>
      <IconTile icon={icon} accent={accent} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        <p className="truncate text-xs text-slate-500">{unavailable ? 'Not available yet' : text}</p>
      </div>
      <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-slate-400" />
    </div>
  );
  return to ? <Link to={to} className="block h-full rounded-xl">{body}</Link> : body;
}

/** Section card with a title row and an optional right-aligned "View All" link. */
export function Section({ title, linkTo, linkLabel = 'View All', right, children, className, bodyClassName }) {
  return (
    <section className={cx('glow-card min-w-0 rounded-xl', className)}>
      <header className="relative flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {right}
        {linkTo && (
          <Link to={linkTo} className="inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline">
            {linkLabel} <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        )}
      </header>
      <div className={cx('relative px-5 pb-5 pt-3', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Operational / degraded row for system status lists. */
export function StatusRow({ icon, label, ok, okLabel = 'Operational', badLabel = 'Unavailable', unknown }) {
  const tone = unknown ? 'text-slate-500' : ok ? 'text-emerald-700' : 'text-amber-700';
  const dot = unknown ? 'bg-slate-400' : ok ? 'bg-emerald-500' : 'bg-amber-500';
  return (
    <li className="flex items-center gap-3 rounded-lg bg-panel-2 px-3 py-2">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-accent-soft text-navy-700"><Icon name={icon} className="h-4 w-4" /></span>
      <span className="flex-1 text-sm text-slate-800">{label}</span>
      <span className={cx('text-sm', tone)}>{unknown ? 'Not measured' : ok ? okLabel : badLabel}</span>
      <span className={cx('h-2.5 w-2.5 rounded-full', dot)} aria-hidden="true" />
    </li>
  );
}

/** Small icon + sentence + relative time row for activity feeds. */
export function FeedRow({ icon, accent = 'blue', text, time, to }) {
  const inner = (
    <div className="flex items-center gap-3 py-2">
      <IconTile icon={icon} accent={accent} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{text}</span>
      <span className="shrink-0 text-xs text-slate-500">{time}</span>
    </div>
  );
  return <li className="border-b border-line/60 last:border-0">{to ? <Link to={to} className="block hover:bg-panel-2">{inner}</Link> : inner}</li>;
}

/** Digit box used by the candidate countdown. */
export function CountBox({ value, unit }) {
  return (
    <div className="text-center">
      <div className="grid h-14 w-14 place-items-center rounded-lg border border-brand-hover/50 bg-panel text-2xl font-bold text-white">
        {String(value).padStart(2, '0')}
      </div>
      <p className="mt-1 text-xs text-slate-500">{unit}</p>
    </div>
  );
}
