import { useSearchParams } from 'react-router-dom';
import { Elections } from '../api/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { EmptyState, ErrorState, Field, Loading, PageHeader, Select, StatusBadge } from './ui.jsx';

/** The election chosen in the `?election=` query parameter, defaulting to the first one in the list. */
const RELEVANCE = ['VOTING', 'VERIFICATION', 'PUBLISHED', 'CAMPAIGN', 'REGISTRATION', 'ARCHIVED', 'DRAFT'];

/** Elections that have something to show come first when the URL does not name one. */
export function mostRelevant(choices) {
  return [...choices].sort((a, b) => RELEVANCE.indexOf(a.status) - RELEVANCE.indexOf(b.status))[0] ?? null;
}

export function useElectionChoice(filter, { preferRelevant = false } = {}) {
  const { active } = useAuth();
  const orgId = active.organizationId;
  const [params, setParams] = useSearchParams();
  const list = useApi(() => Elections.list(orgId, 0, 100), [orgId]);
  const all = list.data?.content ?? [];
  const choices = filter ? all.filter(filter) : all;
  const wanted = params.get('election');
  const fallback = preferRelevant ? mostRelevant(choices) : choices[0] ?? null;
  const selected = choices.find((e) => String(e.id) === wanted) ?? fallback;
  const select = (id) => {
    const next = new URLSearchParams(params);
    next.set('election', String(id));
    setParams(next, { replace: true });
  };
  return { list, choices, selected, select, orgId };
}

export function ElectionSelect({ choices, selected, onSelect, label = 'Election' }) {
  if (!choices.length) return null;
  return (
    <Field label={label} htmlFor="election-select">
      <Select id="election-select" value={selected?.id ?? ''} onChange={(e) => onSelect(e.target.value)} className="min-w-[16rem]">
        {choices.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.status}</option>)}
      </Select>
    </Field>
  );
}

/**
 * Page wrapper for workspaces that act on one election at a time. `children` receives
 * ({ election, operator, reload }) where `election` is the full API view including the caller's relation.
 */
export default function ElectionScoped({ title, subtitle, filter, preferRelevant = false, emptyText = 'There are no elections to show yet.', operatorNote = true, children }) {
  const { list, choices, selected, select } = useElectionChoice(filter, { preferRelevant });

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<ElectionSelect choices={choices} selected={selected} onSelect={select} />}
      />
      {list.loading && !list.data && <Loading />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {list.data && !selected && <EmptyState title="No elections">{emptyText}</EmptyState>}
      {selected && (
        <>
          <p className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <StatusBadge status={selected.status} />
            {operatorNote && <span>{selected.me.operator ? 'You operate this election.' : 'You can view this election but not operate it.'}</span>}
          </p>
          {children({ election: selected, operator: selected.me.operator, reload: list.reload })}
        </>
      )}
    </div>
  );
}
