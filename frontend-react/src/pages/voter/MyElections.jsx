import { Link } from 'react-router-dom';
import { Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { getReceipt } from '../../lib/credentialStore.js';

export default function MyElections() {
  const { data, loading, error, reload } = useApi(() => Elections.mine());
  return (
    <div>
      <PageHeader title="My elections" subtitle="Elections where you are on the eligible voter list." />
      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState title="You are not on any voter list yet">Your organization's election administrators add eligible voters.</EmptyState>}
      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((e) => {
          const receipt = getReceipt(e.id);
          return (
            <Card key={e.id} title={e.title} actions={<StatusBadge status={e.status} />}>
              <p className="text-sm text-slate-600">{e.organizationName}</p>
              <p className="mt-2 text-sm text-slate-600">Voting: {formatDateTime(e.rules.votingStart)} – {formatDateTime(e.rules.votingEnd)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!e.me.mayVote && <Badge tone="amber">Not permitted to vote</Badge>}
                {receipt && <Badge tone="green">Receipt saved on this device</Badge>}
                {!receipt && e.me.credentialIssued && <Badge tone="blue">Credential issued</Badge>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/app/e/${e.id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy-900 hover:bg-slate-50">Candidates & manifestos</Link>
                {e.status === 'VOTING' && e.me.mayVote && !receipt && (
                  <Link to={`/app/vote/${e.id}`} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">Vote now</Link>
                )}
                {receipt && <Link to={`/verify?code=${encodeURIComponent(receipt.receiptCode)}`} className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-panel-2">Verify my receipt</Link>}
                {['PUBLISHED', 'ARCHIVED'].includes(e.status) && e.rules.publicResults && (
                  <Link to={`/elections/${e.id}/results`} className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-panel-2">Results</Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
