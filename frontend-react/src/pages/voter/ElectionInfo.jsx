import { Link, useParams } from 'react-router-dom';
import { Candidates, Elections, Voting } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Card, EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from '../../components/ui.jsx';
import AuthImage from '../../components/AuthImage.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function ElectionInfo() {
  const { electionId } = useParams();
  const election = useApi(() => Elections.get(electionId), [electionId]);
  const candidates = useApi(() => Candidates.forElection(electionId), [electionId]);
  const eligibility = useApi(() => Voting.eligibility(electionId), [electionId]);

  if (election.loading) return <Loading />;
  if (election.error) return <ErrorState message={election.error} onRetry={election.reload} />;
  const e = election.data;
  return (
    <div className="space-y-6">
      <PageHeader title={e.title} subtitle={e.description}
        actions={e.status === 'VOTING' && eligibility.data?.mayVote && <Link to={`/app/vote/${e.id}`} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Vote now</Link>} />
      <Card title="Your eligibility" actions={<StatusBadge status={e.status} />}>
        {eligibility.data && (eligibility.data.mayVote
          ? <Alert kind="success">You are eligible to vote in this election.{!eligibility.data.votingOpen && ' Voting is not open right now.'}</Alert>
          : <Alert kind="warning"><ul className="list-disc pl-5">{eligibility.data.reasons.map((r) => <li key={r}>{r}</li>)}</ul></Alert>)}
        <p className="mt-3 text-sm text-slate-600">Voting window: {formatDateTime(e.rules.votingStart)} – {formatDateTime(e.rules.votingEnd)} · up to {e.rules.maxSelections} selection(s){e.rules.notaEnabled ? ' · NOTA available' : ''}</p>
      </Card>
      <h2 className="text-lg font-semibold text-navy-900">Candidates</h2>
      {candidates.loading && <Loading />}
      {candidates.data && candidates.data.length === 0 && <EmptyState title="No approved candidates yet" />}
      <div className="grid gap-4 md:grid-cols-2">
        {(candidates.data ?? []).map((c) => (
          <Card key={c.id}>
            <div className="flex gap-4">
              {c.photoUrl ? <AuthImage src={c.photoUrl} alt={c.displayName} className="h-20 w-20 shrink-0 rounded-md object-cover" />
                : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md bg-accent-soft text-2xl font-semibold text-navy-800">{c.displayName[0]}</div>}
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Ballot #{c.ballotPosition}</p>
                <h3 className="text-lg font-semibold text-navy-900">{c.displayName}</h3>
                {c.qualifications && <p className="text-sm text-slate-600">{c.qualifications}</p>}
                {c.achievements && <p className="mt-1 text-sm text-slate-600">{c.achievements}</p>}
              </div>
            </div>
            {c.manifesto ? (
              <div className="mt-4 space-y-2 text-sm">
                <p className="flex items-center gap-2 font-semibold text-navy-900">Manifesto {c.manifesto.frozen && <Badge tone="red">Frozen</Badge>}</p>
                {['vision', 'mission', 'goals', 'schemes'].map((k) => c.manifesto[k] && (
                  <p key={k}><span className="font-medium capitalize">{k}:</span> {c.manifesto[k]}</p>
                ))}
              </div>
            ) : <p className="mt-4 text-sm text-slate-500">No published manifesto.</p>}
            {c.media.filter((m) => m.mediaType !== 'PHOTO').length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {c.media.filter((m) => m.mediaType !== 'PHOTO').map((m) => (
                  <li key={m.id}><MediaLink media={m} /></li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function MediaLink({ media }) {
  const open = async () => {
    const blob = await Candidates.mediaBlob(media.url);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return <button type="button" className="font-medium text-navy-700 hover:underline" onClick={open}>{media.mediaType.replace('_', ' ').toLowerCase()}: {media.originalFilename}</button>;
}
