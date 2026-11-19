import { Link, NavLink, Outlet } from 'react-router-dom';
import Logo from './Logo.jsx';
import Icon from './icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { cx } from './ui.jsx';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/#features', label: 'Features' },
  { to: '/#how-it-works', label: 'How It Works' },
  { to: '/#everyone', label: 'For Everyone' },
  { to: '/about', label: 'About' },
  { to: '/about', label: 'Contact', key: 'contact' },
];

const FOOTER_LINKS = [
  { to: '/elections', label: 'Public elections' },
  { to: '/verify', label: 'Verify receipt' },
  { to: '/security', label: 'Security' },
  { to: '/guide', label: 'Guide' },
];

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-[#040716]/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.key ?? l.label}
                to={l.to}
                end={l.end}
                className={({ isActive }) => cx('rounded-md px-3 py-1.5 font-medium',
                  isActive && !l.to.includes('#') && l.key !== 'contact' ? 'text-white shadow-[inset_0_-2px_0_0_#3b82f6]' : 'text-slate-700 hover:text-white')}
              >
                {l.label}
              </NavLink>
            ))}
            <Link to="/elections" aria-label="Browse public elections" className="ml-2 grid h-9 w-9 place-items-center rounded-full text-slate-700 hover:bg-white/5">
              <Icon name="search" className="h-5 w-5" />
            </Link>
            {isAuthenticated ? (
              <NavLink to="/app" className="ml-1 rounded-xl bg-brand-gradient px-4 py-2 font-semibold text-white hover:brightness-110">
                Dashboard
              </NavLink>
            ) : (
              <>
                <NavLink to="/login" className="ml-1 rounded-xl border border-slate-300 px-4 py-2 font-medium text-white hover:bg-white/5">
                  Login
                </NavLink>
                <NavLink to="/register" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 font-semibold text-white hover:brightness-110">
                  Get Started <Icon name="arrowRight" className="h-4 w-4" />
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-[#040716]/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span>© {new Date().getFullYear()} DigiVote · OOPS + DBMS Capstone Project</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            {FOOTER_LINKS.map((l) => <Link key={l.to} to={l.to} className="hover:text-white">{l.label}</Link>)}
          </nav>
          <span>Every eligible voter casts one vote. Every accepted ballot can be checked.</span>
        </div>
      </footer>
    </div>
  );
}
