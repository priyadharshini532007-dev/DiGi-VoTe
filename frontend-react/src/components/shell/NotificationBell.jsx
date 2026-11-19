import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notifications } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { electionPath } from '../navigation.js';
import { formatDateTime } from '../../lib/format.js';
import Icon from '../icons.jsx';
import { Badge, Button, cx } from '../ui.jsx';
import { useDismiss } from './useDismiss.js';
import { setUnread } from './unreadStore.js';

const POLL_MS = 60000;

export function notificationCategory(type = '') {
  if (type.startsWith('RESULTS')) return 'Results';
  if (type.includes('MANIFESTO') || type.startsWith('APPLICATION')) return 'Candidacy';
  return 'Election';
}

const FILTERS = ['All', 'Unread', 'Election', 'Candidacy', 'Results'];

export default function NotificationBell() {
  const { active } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ items: [], unread: 0, loaded: false, error: null });
  const [filter, setFilter] = useState('All');
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));

  const load = useCallback(async () => {
    try {
      const r = await Notifications.list();
      setState({ items: r.page.content, unread: r.unread, loaded: true, error: null });
      setUnread(r.unread);
    } catch {
      setState((s) => ({ ...s, loaded: true, error: 'Notifications are unavailable right now.' }));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const visible = state.items.filter((n) => (filter === 'All' ? true : filter === 'Unread' ? !n.readAt : notificationCategory(n.type) === filter));

  const markRead = async (n) => {
    try {
      await Notifications.markRead(n.id);
      await load();
    } catch {
      setState((s) => ({ ...s, error: 'Could not mark the notification as read.' }));
    }
  };

  const markAll = async () => {
    await Promise.allSettled(state.items.filter((n) => !n.readAt).map((n) => Notifications.markRead(n.id)));
    await load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={state.unread ? `Notifications, ${state.unread} unread` : 'Notifications'}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-panel/60 text-slate-700 hover:bg-panel-2"
      >
        <Icon name="bell" className="h-5 w-5" />
        {state.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
            {state.unread > 99 ? '99+' : state.unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[92vw] rounded-lg border border-slate-200 bg-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-navy-900">Notifications</p>
            <Button size="sm" variant="ghost" disabled={!state.unread} onClick={markAll}>Mark all read</Button>
          </div>
          <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2" role="group" aria-label="Filter notifications">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={cx('rounded-full px-2.5 py-1 text-xs font-medium', filter === f ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                {f}
              </button>
            ))}
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {state.error && <li className="px-4 py-3 text-sm text-red-700" role="alert">{state.error}</li>}
            {!state.loaded && <li className="px-4 py-6 text-center text-sm text-slate-500">Loading…</li>}
            {state.loaded && !state.error && visible.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-500">No notifications in this view.</li>
            )}
            {visible.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-navy-900">
                    {!n.readAt && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-navy-600" aria-label="Unread" />}
                    {n.title}
                  </p>
                  <Badge tone="blue">{notificationCategory(n.type)}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
                <div className="mt-1 flex gap-3 text-xs font-medium">
                  {n.electionId && active && (
                    <Link to={electionPath(active.role, n.electionId)} onClick={() => setOpen(false)} className="text-navy-700 hover:underline">Open election</Link>
                  )}
                  {!n.readAt && <button type="button" onClick={() => markRead(n)} className="text-navy-700 hover:underline">Mark read</button>}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 px-4 py-2 text-right">
            <Link to="/app/notifications" onClick={() => setOpen(false)} className="text-sm font-medium text-navy-700">View all notifications</Link>
          </div>
        </div>
      )}
    </div>
  );
}
