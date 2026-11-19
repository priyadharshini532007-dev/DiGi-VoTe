import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ROLE_LABELS } from '../../lib/format.js';
import Icon from '../icons.jsx';
import { useDismiss } from './useDismiss.js';

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  const items = [
    ['/verify', 'Verify a receipt (public)'],
    ['/security', 'How DigiVote protects ballots'],
    ['/guide', 'Project guide: setup and code map'],
    ['/about', 'About DigiVote'],
  ];
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Help and support"
        onClick={() => setOpen((o) => !o)} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel/60 text-slate-700 hover:bg-panel-2">
        <Icon name="help" className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-slate-200 bg-panel py-1 shadow-xl">
          {items.map(([to, label]) => (
            <Link key={to} role="menuitem" to={to} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">{label}</Link>
          ))}
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            For account or election questions, contact your organization's owner or election administrator.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ProfileMenu() {
  const { user, active, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-xl p-1 hover:bg-panel-2" aria-label="Account menu">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-gradient text-sm font-semibold text-white">{initials(user?.fullName)}</span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-navy-900">{user?.fullName}</span>
          <span className="block text-xs text-slate-500">{active ? ROLE_LABELS[active.role] : 'No active role'}</span>
        </span>
        <Icon name="expand" className="hidden h-5 w-5 text-slate-500 lg:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-slate-200 bg-panel py-1 shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-navy-900">{user?.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
            {active && <p className="mt-1 text-xs text-slate-600">{ROLE_LABELS[active.role]} · {active.organizationName}</p>}
          </div>
          <Link role="menuitem" to="/app/profile" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Account settings</Link>
          {active?.role === 'ORG_OWNER' && (
            <Link role="menuitem" to="/app/security" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Security settings</Link>
          )}
          <button type="button" role="menuitem" onClick={() => { logout(); navigate('/login'); }}
            className="block w-full px-4 py-2 text-left text-sm text-red-700 hover:bg-slate-50">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
