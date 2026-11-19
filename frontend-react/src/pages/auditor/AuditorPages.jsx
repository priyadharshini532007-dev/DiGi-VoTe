import { Link } from 'react-router-dom';
import { Elections } from '../../api/endpoints.js';
import { errorCode } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import ElectionScoped from '../../components/ElectionScoped.jsx';
import { Alert, Card, DefinitionList, EmptyState, ErrorState, Hash, Loading, StatCard, Table } from '../../components/ui.jsx';
import { VOTING_DATA_STATUSES } from '../../lib/elections.js';
import BulletinTab from '../admin/BulletinTab.jsx';

export function BulletinPage() {
  return (
    <ElectionScoped title="Bulletin board" subtitle="Hash-chained commitments to every accepted ballot. No identities, no choices." operatorNote={false} preferRelevant>
      {({ election }) => (
        <div className="space-y-4">
          {!VOTING_DATA_STATUSES.includes(election.status) && <EmptyState title="Voting has not opened">The bulletin board fills as ballots are accepted.</EmptyState>}
          {VOTING_DATA_STATUSES.includes(election.status) && <BulletinTab election={election} />}
          {election.rules.publicResults && (
            <p className="text-sm text-slate-600">
              This election's board is also public:{' '}
              <Link className="font-medium text-navy-700" to={`/elections/${election.id}/bulletin`}>open the public view</Link>.
            </p>
          )}
        </div>
      )}
    </ElectionScoped>
  );
}

function ResultVerificationBody({ election }) {
  const result = useApi(() => Elections.results(election.id).catch((e) => {
    if (errorCode(e) === 'NOT_FOUND') return null;
    throw e;
  }), [election.id, election.status]);
  const aggregation = useApi(() => Elections.aggregation(election.id), [election.id, election.status]);
  const bulletin = useApi(() => Elections.bulletin(election.id, 0), [election.id, election.status]);

  if (result.loading || aggregation.loading || bulletin.loading) return <Loading label="Recomputing…" />;
  if (result.error || aggregation.error || bulletin.error) {
    return <ErrorState message={result.error ?? aggregation.error ?? bulletin.error} onRetry={() => { result.reload(); aggregation.reload(); bulletin.reload(); }} />;
  }
  if (!result.data) return <EmptyState title="No results generated yet">Result verification becomes available once results exist.</EmptyState>;

  const r = result.data;
  const a = aggregation.data;
  const b = bulletin.data;
  const onBoard = b.entries.totalElements;
  const selections = r.items.reduce((n, i) => n + i.votes, 0);
  const comparisons = [
    ['Ballots in the tally equal ballots on the bulletin board', `${r.acceptedBallots} tallied vs ${onBoard} on the board`, r.acceptedBallots === onBoard],
    ['Per-option totals add up to the recorded selections', `${selections} summed vs ${r.totalSelections} recorded`, selections === r.totalSelections],
    ['Bulletin head at tally time equals the current head', 'Result head hash compared with the live chain head', r.bulletinHeadHash === b.chain.headHash],
    ['Bulletin hash chain verifies end to end', `${b.chain.entries} entries`, b.chain.valid],
    ['Recomputed aggregates match the stored tally', `${a.ballotsChecked} ballots, ${a.optionsChecked} options`, a.valid],
  ];
  const failed = comparisons.filter((c) => !c[2]);

  return (
    <div className="space-y-6">
      <Alert kind={failed.length ? 'error' : 'success'} title={failed.length ? `${failed.length} discrepanc${failed.length === 1 ? 'y' : 'ies'} found` : 'Results are consistent with the accepted ballot set'}>
        Every comparison below is recomputed from stored data when this page loads. Tally decryption by the server is not proven by a zero-knowledge proof; this check verifies aggregation and bulletin consistency.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Accepted ballots (result)" value={r.acceptedBallots} />
        <StatCard label="Entries on bulletin board" value={onBoard} />
        <StatCard label="Aggregation problems" value={a.problems.length} tone={a.problems.length ? 'red' : undefined} />
      </div>
      <Card title="Consistency checks" padded={false}>
        <Table rowKey={(c) => c[0]} rows={comparisons} columns={[
          { key: 'label', label: 'Check', render: (c) => <span className="font-medium text-navy-900">{c[0]}</span> },
          { key: 'detail', label: 'Evidence', render: (c) => c[1], className: 'text-slate-600' },
          { key: 'ok', label: 'Outcome', render: (c) => (c[2] ? <span className="font-medium text-emerald-700">✓ Consistent</span> : <span className="font-medium text-red-700">✕ Discrepancy</span>) },
        ]} />
      </Card>
      <Card title="Totals">
        <Table rowKey={(i) => i.optionIndex} rows={r.items} columns={[
          { key: 'rank', label: 'Rank' },
          { key: 'label', label: 'Option', render: (i) => <span className="font-medium">{i.label}</span> },
          { key: 'votes', label: 'Votes' },
          { key: 'percent', label: 'Share', render: (i) => `${i.percent}%` },
        ]} />
        <div className="mt-4">
          <DefinitionList items={[
            ['Result hash', <Hash value={r.resultHash} len={32} />],
            ['Bulletin head at tally', <Hash value={r.bulletinHeadHash} len={32} />],
            ['Current bulletin head', <Hash value={b.chain.headHash} len={32} />],
          ]} />
        </div>
      </Card>
    </div>
  );
}

export function ResultVerificationPage() {
  return (
    <ElectionScoped
      title="Result verification"
      subtitle="Independently compare generated results with the accepted ballot set."
      filter={(e) => ['VERIFICATION', 'PUBLISHED', 'ARCHIVED'].includes(e.status)}
      emptyText="No election has closed voting yet."
      operatorNote={false}
    >
      {({ election }) => <ResultVerificationBody election={election} />}
    </ElectionScoped>
  );
}
