import { Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Card, ErrorState, Loading, StatCard } from '../../components/ui.jsx';
import { TurnoutChart } from '../../components/Charts.jsx';

export default function ProgressTab({ election }) {
  const p = useApi(() => Elections.participation(election.id), [election.id]);
  if (p.loading) return <Loading />;
  if (p.error) return <ErrorState message={p.error} onRetry={p.reload} />;
  const d = p.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Eligible voters" value={d.eligible_voters} />
        <StatCard label="Credentials issued" value={d.credentials_issued} hint="Identity side" />
        <StatCard label="Accepted ballots" value={d.accepted_ballots} hint="Anonymous side" />
        <StatCard label="Turnout" value={`${d.turnout_percent}%`} />
      </div>
      <Card title="Turnout">
        <TurnoutChart voted={d.accepted_ballots} eligible={d.eligible_voters} />
        <p className="mt-4 text-center text-xs text-slate-500">
          Figures come from the stored procedure <code>sp_election_participation</code>. Counts are aggregated
          separately on each side; ballots are never joined to voters.
        </p>
      </Card>
      {d.ballots_exceed_credentials === 1 && <Alert kind="error">More ballots than issued credentials: investigate immediately.</Alert>}
      <p className="text-sm text-slate-600">Individual selections are not visible to anyone while voting is open; only the encrypted tally is decrypted after voting closes.</p>
    </div>
  );
}
