import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Elections, Reports as ReportsApi } from '../../api/endpoints.js';
import { errorCode } from '../../api/client.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useFanOut } from '../../hooks/useFanOut.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ElectionSelect, useElectionChoice } from '../../components/ElectionScoped.jsx';
import DataTable from '../../components/DataTable.jsx';
import { ParticipationChart, ResultsChart, TurnoutChart, TurnoutComparisonChart } from '../../components/Charts.jsx';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, StatCard, StatusBadge, Table, Tabs } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { COMPLETED_STATUSES, VOTING_DATA_STATUSES, turnoutPercent } from '../../lib/elections.js';
import { downloadCsv, fileStamp, printPage } from '../../lib/download.js';
import ReportView from '../shared/ReportView.jsx';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'results', label: 'Election results' },
  { key: 'turnout', label: 'Turnout analytics' },
  { key: 'historical', label: 'Historical analytics' },
  { key: 'reports', label: 'Report center' },
  { key: 'exports', label: 'Export center' },
];

const notFoundAsNull = (e) => {
  if (errorCode(e) === 'NOT_FOUND') return null;
  throw e;
};

function ChartCard({ title, source, children }) {
  return (
    <Card title={title}>
      {children}
      <p className="mt-3 text-xs text-slate-500">Source: {source}</p>
    </Card>
  );
}

export default function ResultsAnalytics() {
  const { active, can } = useAuth();
  const { list, choices, selected, select } = useElectionChoice(undefined, { preferRelevant: true });
  const [tab, setTab] = useState('overview');
  const sid = selected?.id;
  const status = selected?.status;
  const hasData = VOTING_DATA_STATUSES.includes(status);

  const resultsExist = ['VERIFICATION', 'PUBLISHED', 'ARCHIVED'].includes(status);
  const results = useApi(() => (sid && resultsExist ? Elections.results(sid).catch(notFoundAsNull) : Promise.resolve(null)), [sid, status]);
  const progress = useApi(() => (sid && hasData ? Elections.participation(sid).catch(() => null) : Promise.resolve(null)), [sid, status]);
  const aggregation = useApi(() => (sid && hasData && can('VERIFY_INTEGRITY') ? Elections.aggregation(sid).catch(() => null) : Promise.resolve(null)), [sid, status]);
  const timeline = useApi(() => (sid ? Elections.timeline(sid).catch(() => []) : Promise.resolve([])), [sid, status]);

  const completed = useMemo(() => (list.data?.content ?? []).filter((e) => COMPLETED_STATUSES.includes(e.status)), [list.data]);
  const historical = useFanOut(tab === 'historical' ? completed.map((e) => e.id) : [], (id) => Elections.results(id).catch(notFoundAsNull));
  const report = useAction();
  const [generated, setGenerated] = useState(null);

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;

  const header = (
    <PageHeader title="Results & analytics" subtitle="Validated results, participation and comparisons. Figures follow each election's publication rules."
      actions={<ElectionSelect choices={choices} selected={selected} onSelect={select} />} />
  );
  if (!selected) return <div>{header}<EmptyState title="No elections yet" /></div>;

  const r = results.data;
  const p = progress.data;
  const eligible = p?.eligible_voters ?? selected.eligibleVoters;
  const accepted = p?.accepted_ballots ?? r?.acceptedBallots ?? null;
  const turnout = accepted === null ? null : turnoutPercent(accepted, eligible);
  const invalid = aggregation.data ? aggregation.data.malformedBallots + aggregation.data.commitmentMismatches : null;
  const publication = r ? (r.status === 'PUBLISHED' ? 'Published' : 'Generated, unpublished') : 'No results yet';

  const historicalRows = completed.filter((e) => historical.data[e.id]).map((e) => {
    const res = historical.data[e.id];
    const winner = res.items.find((i) => i.winner);
    return {
      id: e.id, title: e.title, ended: e.rules.votingEnd, method: res.countingMethod, eligible: e.eligibleVoters,
      ballots: res.acceptedBallots, turnout: turnoutPercent(res.acceptedBallots, e.eligibleVoters),
      winner: winner?.label ?? (res.tieDetected ? 'Tie: no winner' : '—'), status: res.status,
    };
  });

  const exportResults = () => downloadCsv(`results-${selected.id}-${fileStamp()}.csv`, [
    { label: 'Rank', value: (i) => i.rank }, { label: 'Option', value: (i) => i.label },
    { label: 'Votes', value: (i) => i.votes }, { label: 'Percent', value: (i) => i.percent }, { label: 'Winner', value: (i) => (i.winner ? 'yes' : '') },
  ], r.items);
  const exportParticipation = () => downloadCsv(`participation-${selected.id}-${fileStamp()}.csv`, [
    { label: 'Election', value: () => selected.title }, { label: 'Eligible voters', value: () => eligible },
    { label: 'Credentials issued', value: () => p?.credentials_issued ?? '' }, { label: 'Accepted ballots', value: () => accepted ?? '' },
    { label: 'Turnout percent', value: () => turnout ?? '' },
  ], [{}]);
  const exportHistorical = () => downloadCsv(`historical-${fileStamp()}.csv`, [
    { label: 'Election', value: (h) => h.title }, { label: 'Voting ended', value: (h) => h.ended },
    { label: 'Counting method', value: (h) => h.method }, { label: 'Eligible voters', value: (h) => h.eligible },
    { label: 'Accepted ballots', value: (h) => h.ballots }, { label: 'Turnout percent', value: (h) => h.turnout ?? '' },
    { label: 'Winner', value: (h) => h.winner },
  ], historicalRows);

  return (
    <div className="space-y-6">
      {header}
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <StatusBadge status={selected.status} />
        {r && r.status !== 'PUBLISHED' && <Badge tone="amber">Generated results are visible to operators and auditors only until published</Badge>}
      </p>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard icon="users" label="Eligible voters" value={eligible} hint="Voters on the final eligible list" />
            <StatCard icon="ballot" label="Votes recorded" value={progress.loading ? '…' : accepted ?? '—'} hint="Accepted ballots" />
            <StatCard icon="chart" label="Turnout" value={turnout === null ? '—' : `${turnout}%`} hint="Accepted ballots ÷ eligible voters" />
            <StatCard icon="checkCircle" label="Validated ballots" value={r ? r.acceptedBallots : 'Pending'} hint={aggregation.data ? (aggregation.data.valid ? 'Aggregation recomputed: consistent' : 'Aggregation recomputed: inconsistent') : 'Counted once results are generated'} tone={aggregation.data && !aggregation.data.valid ? 'red' : undefined} />
            <StatCard icon="warning" label="Invalid ballots" value={invalid === null ? 'Not tracked' : invalid} hint={invalid === null ? 'Rejected submissions are never stored as ballots' : 'Malformed or mismatching stored ballots'} />
            <StatCard icon="flag" label="Publication status" value={publication} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Candidate results" source={r ? `Generated results (${r.countingMethod}), ${r.status.toLowerCase()}` : 'No results generated yet'}>
              {r ? <ResultsChart items={r.items} /> : <EmptyState title="No results yet">Results are generated after voting closes.</EmptyState>}
            </ChartCard>
            <ChartCard title="Turnout" source="Stored procedure sp_election_participation">
              {hasData && accepted !== null ? <TurnoutChart voted={accepted} eligible={eligible} /> : <EmptyState title="Voting has not opened" />}
            </ChartCard>
            <ChartCard title="Participation breakdown" source="Eligible list, issued credentials and accepted ballots, counted separately">
              {hasData && p ? <ParticipationChart eligible={p.eligible_voters} credentials={p.credentials_issued} accepted={p.accepted_ballots} /> : <EmptyState title="No participation data yet" />}
            </ChartCard>
            <Card title="Election timeline">
              {timeline.loading && <Loading />}
              <ol className="space-y-3 border-l border-slate-200 pl-5">
                {(timeline.data ?? []).map((t, i) => (
                  <li key={i}>
                    <p className="text-sm font-medium text-navy-900"><StatusBadge status={t.to} /> {t.from ? `from ${t.from}` : 'created'}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(t.occurredAt)}{t.actorName ? ` · ${t.actorName}` : ''}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-slate-500">Source: lifecycle transition history.</p>
            </Card>
          </div>
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-6">
          {results.error && <ErrorState message={results.error} onRetry={results.reload} />}
          {!results.loading && !r && <EmptyState title="No results yet">Results are generated by the election administrator after voting closes.</EmptyState>}
          {r && (
            <>
              <Alert kind={r.tieDetected ? 'warning' : 'success'} title={r.explanation}>
                {r.acceptedBallots} accepted ballots · counting method {r.countingMethod} · {r.status.toLowerCase()}
                {aggregation.data && ` · aggregation ${aggregation.data.valid ? 'verified' : 'INCONSISTENT'}`}
              </Alert>
              <Card title="Ranking" padded={false}>
                <Table rowKey={(i) => i.optionIndex} rows={r.items} columns={[
                  { key: 'rank', label: 'Rank' },
                  { key: 'label', label: 'Option', render: (i) => <span className="font-medium">{i.label} {i.winner && <Badge tone="green">Winner</Badge>}</span> },
                  { key: 'votes', label: 'Votes' },
                  { key: 'percent', label: 'Share', render: (i) => `${i.percent}%` },
                ]} />
              </Card>
              <Card title="Votes per option"><ResultsChart items={r.items} /></Card>
            </>
          )}
        </div>
      )}

      {tab === 'turnout' && (
        <div className="space-y-6">
          {!hasData && <EmptyState title="Voting has not opened">Turnout appears once ballots are accepted.</EmptyState>}
          {hasData && progress.loading && <Loading />}
          {hasData && !progress.loading && !p && <Alert kind="info">Participation counts are available to the election's operators and auditors.</Alert>}
          {p && (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <StatCard label="Eligible voters" value={p.eligible_voters} />
                <StatCard label="Credentials issued" value={p.credentials_issued} hint="Obtained an anonymous credential" />
                <StatCard label="Accepted ballots" value={p.accepted_ballots} />
                <StatCard label="Turnout" value={`${p.turnout_percent}%`} hint="Accepted ballots ÷ eligible voters" />
              </div>
              {p.ballots_exceed_credentials === 1 && <Alert kind="error">More ballots than issued credentials: investigate immediately.</Alert>}
              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Turnout" source="sp_election_participation"><TurnoutChart voted={p.accepted_ballots} eligible={p.eligible_voters} /></ChartCard>
                <ChartCard title="Participation breakdown" source="sp_election_participation"><ParticipationChart eligible={p.eligible_voters} credentials={p.credentials_issued} accepted={p.accepted_ballots} /></ChartCard>
              </div>
              <p className="text-xs text-slate-500">Per-hour turnout trends are not shown: the platform deliberately stores no per-ballot timestamps, to protect voter anonymity.</p>
            </>
          )}
        </div>
      )}

      {tab === 'historical' && (
        <Card title="Completed elections" padded={false}
          actions={historicalRows.length > 0 && <Button size="sm" variant="secondary" onClick={exportHistorical}>Export CSV</Button>}>
          {historical.loading && <Loading />}
          {!historical.loading && completed.length === 0 && <div className="p-5"><EmptyState title="No completed elections">Comparisons appear once elections have published results.</EmptyState></div>}
          {historicalRows.length > 0 && (
            <>
              <div className="border-b border-slate-100 p-5">
                <TurnoutComparisonChart rows={historicalRows.filter((h) => h.turnout !== null).map((h) => ({ label: h.title, turnout: h.turnout }))} />
                <p className="mt-3 text-xs text-slate-500">All bars use accepted ballots ÷ the election's eligible voters, so they are comparable.</p>
              </div>
              <DataTable
                rows={historicalRows}
                rowKey={(h) => h.id}
                searchLabel="Search elections"
                searchText={(h) => h.title}
                columns={[
                  { key: 'title', label: 'Election', sortValue: (h) => h.title, render: (h) => <Link className="font-medium text-navy-900 hover:underline" to={`/app/elections/${h.id}?tab=results`}>{h.title}</Link> },
                  { key: 'ended', label: 'Voting ended', sortValue: (h) => h.ended, render: (h) => formatDateTime(h.ended) },
                  { key: 'method', label: 'Counting' },
                  { key: 'eligible', label: 'Eligible', sortable: true },
                  { key: 'ballots', label: 'Ballots', sortable: true },
                  { key: 'turnout', label: 'Turnout', sortValue: (h) => h.turnout, render: (h) => (h.turnout === null ? '—' : `${h.turnout}%`) },
                  { key: 'winner', label: 'Winner' },
                ]}
              />
            </>
          )}
          {historical.failed > 0 && <p className="px-5 py-3 text-xs text-amber-800">Results could not be loaded for {historical.failed} election(s).</p>}
        </Card>
      )}

      {tab === 'reports' && (
        <div className="space-y-6">
          <Card title="Generate a report for this election">
            {!can('GENERATE_REPORTS') && <p className="text-sm text-slate-600">Your role cannot generate reports.</p>}
            {can('GENERATE_REPORTS') && (
              <div className="flex flex-wrap gap-3">
                {['ELECTION', 'PARTICIPATION', 'HEALTH', 'AUDIT', 'SECURITY'].map((t) => (
                  <Button key={t} variant="secondary" busy={report.busy} onClick={async () => {
                    const out = await report.run(() => ReportsApi.forElection(selected.id, t), `${t.toLowerCase()} report generated`);
                    if (out) setGenerated(out);
                  }}>{t[0] + t.slice(1).toLowerCase()} report</Button>
                ))}
              </div>
            )}
            {report.error && <div className="mt-4"><Alert kind="error">{report.error}</Alert></div>}
            {report.success && <div className="mt-4"><Alert kind="success">{report.success}</Alert></div>}
          </Card>
          {generated && <ReportView report={generated} />}
          <p className="text-sm text-slate-600">Earlier reports are listed under <Link className="font-medium text-navy-700" to="/app/reports">Reports</Link>.</p>
        </div>
      )}

      {tab === 'exports' && (
        <Card title="Export center">
          <p className="text-sm text-slate-600">Files are built in your browser from the authorized data shown on this page. Values that spreadsheets could treat as formulas are neutralised.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" disabled={!r} onClick={exportResults}>Results (CSV)</Button>
            <Button variant="secondary" disabled={!p} onClick={exportParticipation}>Participation (CSV)</Button>
            <Button variant="secondary" onClick={() => { setTab('historical'); }}>Historical comparison (open tab to export)</Button>
            <Button onClick={printPage}>Print or save this page as PDF</Button>
          </div>
          {!r && <p className="mt-3 text-xs text-slate-500">Results export unlocks when results exist.</p>}
          <p className="mt-4 text-xs text-slate-500">Signed in to {active.organizationName}; exports contain no voter identities and no individual selections.</p>
        </Card>
      )}
    </div>
  );
}
