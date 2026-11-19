import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { crumbsFor } from '../navigation.js';

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const { active } = useAuth();
  const crumbs = crumbsFor(pathname, active?.role);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.to && !last
                ? <Link to={c.to} className="truncate hover:text-navy-800">{c.label}</Link>
                : <span aria-current={last ? 'page' : undefined} className={last ? 'truncate font-medium text-navy-900' : 'truncate'}>{c.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
