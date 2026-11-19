import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Badge, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, StatusBadge } from '../../components/ui.jsx';
import { STATUS_ORDER, formatDateTime } from '../../lib/format.js';
import { getReceipt } from '../../lib/credentialStore.js';
import { voterStatusFor } from '../../lib/voterStatus.js';

function eligibilityLabel(e) {
  if (!e.me.eligibleVoter) return { tone: 'gray', text: 'Not on the voter list' };
  if (e.me.mayVote) return { tone: 'green', text: 'You are eligible to vote' };
  return { tone: 'amber', text: 'On the voter list, not permitted to vote' };
}

export default function ElectionDirectory() {
  const { active } = useAuth();
  const list = useApi(() => Elections.list(active.organizationId, 0, 100), [active.organizationId]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  const rows = (list.data?.content ?? []).filter((e) => (!status || e.status === status)
    && (!query.trim() || `${e.title} ${e.organizationName} ${e.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())));

  return (
    <div className="space-y-6">
      <PageHeader title="Election directory" subtitle="Every election your organization has made visible to you." />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Field label="Search elections" htmlFor="dir-search"><Input id="dir-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, organization or description" /></Field>
        </div>
        <Field label="Status" htmlFor="dir-status">
          <Select id="dir-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="">All statuses</option>
            {STATUS_ORDER.filter((s) => s !== 'DRAFT').map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>

      {list.loading && <Loading />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {list.data && rows.length === 0 && <EmptyState title="No elections match">Elections appear here once an administrator publishes them.</EmptyState>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((e) => {
          const elig = eligibilityLabel(e);
          const vs = voterStatusFor(e, getReceipt(e.id));
          return (
            <Card key={e.id} title={e.title} actions={<StatusBadge status={e.status} />}>
              <p className="text-sm text-slate-600">{e.organizationName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {e.rules.countingMethod === 'APPROVAL' ? 'Approval voting' : 'Single choice'} · voting {formatDateTime(e.rules.votingStart)} – {formatDateTime(e.rules.votingEnd)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={elig.tone}>{elig.text}</Badge>
                {e.me.eligibleVoter && <Badge tone={vs.tone}>{vs.label}</Badge>}
              </div>
              <div className="mt-4">
                <Link to={`/app/e/${e.id}`} className="text-sm font-medium text-navy-700 hover:underline">View details</Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
