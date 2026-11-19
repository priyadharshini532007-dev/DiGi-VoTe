import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import Icon from './icons.jsx';
import { PromoCard } from './Hero.jsx';
import Breadcrumbs from './shell/Breadcrumbs.jsx';
import GlobalSearch from './shell/GlobalSearch.jsx';
import NotificationBell from './shell/NotificationBell.jsx';
import ProfileMenu, { HelpMenu } from './shell/ProfileMenu.jsx';
import { useUnread } from './shell/unreadStore.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { NAV_GROUPS, PORTALS, homeFor } from './navigation.js';
import { ROLE_LABELS } from '../lib/format.js';
import { Alert, Loading, cx } from './ui.jsx';

function NavItem({ to, label, icon, onClick, badge }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) => cx(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition',
        isActive
          ? 'bg-brand text-white shadow-[0_6px_18px_-8px_rgba(37,99,235,0.9)]'
          : 'text-slate-700 hover:bg-white/5 hover:text-white',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon name={icon} className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {badge > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
              {badge > 99 ? '99+' : badge}
              <span className="sr-only"> unread</span>
            </span>
          )}
          {isActive && <Icon name="chevronRight" className="h-4 w-4 shrink-0 opacity-80" />}
        </>
      )}
    </NavLink>
  );
}

/** Pages outside the design's menu stay reachable under a folded "More" group. */
function MoreGroup({ group, onNavigate, pathname }) {
  const containsActive = group.items.some((i) => i.to === pathname);
  const [open, setOpen] = useState(containsActive);
  const shown = open || containsActive;
  return (
    <div>
      <button type="button" aria-expanded={shown} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-white">
        {group.title}
        <Icon name="expand" className={cx('h-4 w-4 transition', shown && 'rotate-180')} />
      </button>
      {shown && (
        <div className="mt-1 space-y-1">
          {group.items.map((i) => <NavItem key={i.to} {...i} onClick={onNavigate} />)}
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }) {
  const { memberships, active, selectMembership } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const unread = useUnread();
  const groups = NAV_GROUPS[active?.role] ?? [];
  const portal = PORTALS[active?.role];

  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-line bg-[#050a22]/95 px-3 py-5">
      <div className="px-2"><Logo to="/" subtitle={portal?.name} /></div>
      {memberships.length > 1 && (
        <div className="mt-4 px-2">
          <label htmlFor="org-switch" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Switch organization & role
          </label>
          <select
            id="org-switch"
            className="mt-1 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-white"
            value={active?.membershipId ?? ''}
            onChange={(e) => {
              const m = memberships.find((x) => x.membershipId === Number(e.target.value));
              selectMembership(m.membershipId);
              navigate(homeFor(m.role));
            }}
          >
            {memberships.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.organizationName} · {ROLE_LABELS[m.role]}
              </option>
            ))}
          </select>
        </div>
      )}
      <nav className="mt-6 flex-1 space-y-4" aria-label="Dashboard">
        {groups.map((g, gi) => (g.title === 'More'
          ? <MoreGroup key="more" group={g} onNavigate={onNavigate} pathname={pathname} />
          : (
            <div key={g.title || `g${gi}`}>
              {g.title && <p className="mb-1.5 px-3 text-sm font-medium text-slate-500">{g.title}</p>}
              <div className="space-y-1">
                {g.items.map((i) => (
                  <NavItem key={i.to} {...i} onClick={onNavigate} badge={i.to === '/app/notifications' ? unread : 0} />
                ))}
              </div>
            </div>
          )))}
      </nav>
      {portal?.promo && (
        <div className="mt-6">
          <PromoCard role={active.role} promo={portal.promo} />
        </div>
      )}
    </div>
  );
}

/** Dashboard home pages carry their own hero banner, so they show no breadcrumb trail. */
export default function AppShell() {
  const { active } = useAuth();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHome = active && pathname === homeFor(active.role);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to main content
      </a>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[17rem] lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 bg-navy-950/70 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]" onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="min-h-screen lg:pl-[17rem]">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-[#050a22]/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-3 sm:px-6">
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-slate-700 hover:bg-white/5 lg:hidden">
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <GlobalSearch />
            <div className="flex-1" />
            <HelpMenu />
            <NotificationBell />
            <ProfileMenu />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6">
          {active && !isHome && <div className="mb-4"><Breadcrumbs /></div>}
          {!active && <div className="mb-4"><Alert kind="warning">You are not an active member of any organization yet.</Alert></div>}
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
