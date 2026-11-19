import { Link } from 'react-router-dom';
import { Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { getReceipt } from '../../lib/credentialStore.js';
import { VOTER_STATUS, voterStatusFor } from '../../lib/voterStatus.js';

export default function CastVoteHub() {
  const mine = useApi(() => Elections.mine(), []);
  const open = (mine.data ?? []).filter((e) => e.status === 'VOTING');

  return (
    <div className="space-y-6">
      <PageHeader title="Cast vote" subtitle="Elections that are open for voting right now." />
      {mine.loading && <Loading />}
      {mine.error && <ErrorState message={mine.error} onRetry={mine.reload} />}
      {mine.data && open.length === 0 && (
        <EmptyState title="No election is open for voting"
          action={<Link to="/app/directory" className="text-sm font-medium text-navy-700">Browse the election directory</Link>}>
          When voting opens for an election you are eligible for, it appears here.
        </EmptyState>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {open.map((e) => {
          const receipt = getReceipt(e.id);
          const vs = voterStatusFor(e, receipt);
          const canVote = vs.key === VOTER_STATUS.READY.key;
          return (
            <Card key={e.id} title={e.title} actions={<StatusBadge status={e.status} />}>
              <p className="text-sm text-slate-600">{e.organizationName}</p>
              <p className="mt-1 text-xs text-slate-500">Closes {formatDateTime(e.rules.votingEnd)} · up to {e.rules.maxSelections} selection(s){e.rules.notaEnabled ? ' · NOTA available' : ''}</p>
              <div className="mt-3"><Badge tone={vs.tone}>{vs.label}</Badge></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {canVote && <Link to={`/app/vote/${e.id}`} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">Go to ballot</Link>}
                {vs.key === VOTER_STATUS.CREDENTIAL_ONLY.key && <Link to={`/app/vote/${e.id}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-navy-900 hover:bg-slate-50">Open ballot page</Link>}
                <Link to={`/app/e/${e.id}`} className="rounded-md px-3 py-2 text-sm font-medium text-navy-700 hover:bg-panel-2">Candidates & manifestos</Link>
                {receipt && <Link to={`/app/verify?code=${encodeURIComponent(receipt.receiptCode)}`} className="rounded-md px-3 py-2 text-sm font-medium text-navy-700 hover:bg-panel-2">Verify my receipt</Link>}
              </div>
            </Card>
          );
        })}
      </div>
      <Card title="How voting works">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Review the candidates and their manifestos.</li>
          <li>Your browser obtains a one-time anonymous credential; the server never sees which ballot is yours.</li>
          <li>Select your choice(s) and confirm. Nothing is submitted until you confirm.</li>
          <li>Keep your receipt to verify later that your ballot was recorded and counted.</li>
        </ol>
      </Card>
    </div>
  );
}
