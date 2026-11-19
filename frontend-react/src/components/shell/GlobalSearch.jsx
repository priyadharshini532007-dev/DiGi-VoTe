import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Elections } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { COMMON_NAV, NAV, PORTALS, electionPath } from '../navigation.js';
import Icon from '../icons.jsx';
import { useDismiss } from './useDismiss.js';

/** Searches the pages available to the current role and the organization's elections (client-side). */
export default function GlobalSearch() {
  const { active } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [elections, setElections] = useState(null);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));

  const loadElections = async () => {
    if (elections !== null || !active) return;
    try {
      const r = await Elections.list(active.organizationId, 0, 100);
      setElections(r.content);
    } catch {
      setElections([]);
    }
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !active) return [];
    const seen = new Set();
    const pages = [...(NAV[active.role] ?? []), ...COMMON_NAV]
      .filter((i) => i.label.toLowerCase().includes(q) && !seen.has(i.to) && seen.add(i.to))
      .map((i) => ({ key: i.to, label: i.label, hint: 'Page', to: i.to }));
    const found = (elections ?? [])
      .filter((e) => e.title.toLowerCase().includes(q))
      .map((e) => ({ key: `e${e.id}`, label: e.title, hint: `Election · ${e.status}`, to: electionPath(active.role, e.id) }));
    return [...found, ...pages].slice(0, 8);
  }, [query, elections, active]);

  const go = (to) => {
    setOpen(false);
    setQuery('');
    navigate(to);
  };

  return (
    <div className="relative hidden min-w-0 flex-1 md:block md:max-w-xl" ref={ref}>
      <label htmlFor="global-search" className="sr-only">Search pages and elections</label>
      <span className="pointer-events-none absolute left-3.5 top-3 text-slate-500"><Icon name="search" className="h-5 w-5" /></span>
      <input
        id="global-search"
        type="search"
        autoComplete="off"
        placeholder={PORTALS[active?.role]?.search ?? 'Search pages and elections'}
        value={query}
        onFocus={() => { setOpen(true); loadElections(); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].to); }}
        className="w-full rounded-xl border border-line bg-panel/70 py-2.5 pl-11 pr-3 text-sm text-slate-800 placeholder:text-slate-500 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600"
      />
      {open && query.trim() && (
        <ul className="absolute left-0 right-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-panel py-1 shadow-lg" aria-label="Search results">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching pages or elections.</li>}
          {results.map((r) => (
            <li key={r.key}>
              <Link to={r.to} onClick={() => { setOpen(false); setQuery(''); }} className="block px-3 py-2 text-sm hover:bg-slate-50">
                <span className="font-medium text-navy-900">{r.label}</span>
                <span className="ml-2 text-xs text-slate-500">{r.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
