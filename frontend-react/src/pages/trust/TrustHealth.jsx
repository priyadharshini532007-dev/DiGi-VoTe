import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Audit, Elections, Public } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ElectionSelect, useElectionChoice } from '../../components/ElectionScoped.jsx';
import { CheckStatusChart } from '../../components/Charts.jsx';
import { Alert, Badge, Button, Card, DefinitionList, EmptyState, ErrorState, Loading, PageHeader, StatCard, StatusBadge, Table, Tabs } from '../../components/ui.jsx';
import Icon from '../../components/icons.jsx';
import { formatDateTime } from '../../lib/format.js';
import { VOTING_DATA_STATUSES } from '../../lib/elections.js';
import { TRUST_RULE, countChecks, trustVerdict } from '../../lib/trustStatus.js';
import { downloadCsv, downloadJson, fileStamp, printPage } from '../../lib/download.js';
import { ChainResult } from '../shared/AuditLog.jsx';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'integrity', label: 'Integrity monitor' },
  { key: 'voting', label: 'Voting integrity' },
  { key: 'verification', label: 'Verification monitor' },
  { key: 'readiness', label: 'Election readiness' },
  { key: 'health', label: 'System health' },
  { key: 'report', label: 'Trust report' },
];

const ANONYMITY_DESIGN = [
  'Identity and ballot data live in separate tables with no foreign key between them (checked by automated tests).',
  'Ballots carry random identifiers and no per-ballot timestamps or per-ballot audit events.',
  'Credentials are blind-signed in the browser, so the server cannot link a credential to a ballot.',
];

function parseReason(metadataJson) {
  try {
    return JSON.parse(metadataJson)?.reason ?? 'UNSPECIFIED';
  } catch {
    return 'UNSPECIFIED';
  }
}

function VerdictBanner({ verdict, election }) {
  return (
    <div className={`flex flex-wrap items-center gap-4 rounded-xl border px-6 py-5 ${
      verdict.kind === 'success' ? 'border-emerald-200 bg-emerald-50' : verdict.kind === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
      <span className={verdict.kind === 'success' ? 'text-emerald-700' : verdict.kind === 'warning' ? 'text-amber-700' : 'text-red-700'}>
        <Icon name={verdict.icon} className="h-10 w-10" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Election trust status</p>
        <p className="text-2xl font-semibold text-navy-900">{verdict.label}</p>
        <p className="text-sm text-slate-700">{election.title}</p>
      </div>
    </div>
  );
}

function SystemHealth({ electionLoaded }) {
  const [state, setState] = useState({ status: 'loading' });
  const check = async () => {
    setState({ status: 'loading' });
    const started = performance.now();
    try {
      const body = await Public.health();
      setState({ status: 'up', ms: Math.round(performance.now() - started), body, at: new Date().toISOString() });
    } catch (e) {
      setState({ status: 'down', error: errorMessage(e), at: new Date().toISOString() });
    }
  };
  useEffect(() => { check(); }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="speed" label="Backend availability" value={state.status === 'loading' ? '…' : state.status === 'up' ? 'Available' : 'Unreachable'}
          tone={state.status === 'down' ? 'red' : state.status === 'up' ? 'green' : undefined} hint={state.at ? `Checked ${formatDateTime(state.at)}` : undefined} />
        <StatCard icon="clock" label="API response time" value={state.ms !== undefined ? `${state.ms} ms` : '—'} hint="One request, measured in this browser" />
        <StatCard icon="archive" label="Database connectivity" value={electionLoaded ? 'Reachable' : 'Unknown'}
          hint={electionLoaded ? 'Inferred: this page just read live election data' : 'Inferred from successful reads'} />
        <StatCard icon="warning" label="API error rate" value="Not measured" hint="The backend exposes no error metrics to the interface" />
      </div>
      {state.status === 'down' && <Alert kind="error" title="The backend did not answer">{state.error}</Alert>}
      <Card title="What is and is not measured" actions={<Button size="sm" variant="secondary" onClick={check}>Re-check</Button>}>
        <DefinitionList items={[
          ['Application', state.body?.application ?? '—'],
          ['Reported status', state.body?.status ?? '—'],
          ['Storage status', 'Not measured: the storage provider reports nothing to the interface'],
          ['Operational incidents', 'Not tracked: use security events and the audit log for security-relevant failures'],
        ]} />
        <p className="mt-3 text-xs text-slate-500">
          Only the public health endpoint answers here. Database, storage and error-rate figures need an operations
          monitoring integration that this platform does not include; nothing is estimated or invented.
        </p>
      </Card>
    </div>
  );
}

function VotingIntegrity({ election, trust }) {
  const { can } = useAuth();
  const trail = useApi(() => (can('VIEW_AUDIT_LOGS') ? Elections.auditTrail(election.id) : Promise.resolve([])), [election.id, election.status]);
  const rejects = useMemo(() => {
    const counts = {};
    (trail.data ?? []).filter((r) => r.eventType === 'BALLOT_REJECTED').forEach((r) => {
      const reason = parseReason(r.metadataJson);
      counts[reason] = (counts[reason] ?? 0) + 1;
    });
    return Object.entries(counts).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [trail.data]);
  const ballots = trust.checks.find((c) => c.key === 'ballots');
  const duplicates = trust.checks.find((c) => c.key === 'duplicates');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Credentials issued" value={trust.credentialsIssued} />
        <StatCard label="Spent tokens" value={trust.spentTokens} />
        <StatCard label="Accepted ballots" value={trust.acceptedBallots} />
        <StatCard label="Duplicate attempts rejected" value={trust.duplicateRejections} />
      </div>
      <Card title="Entitlement enforcement" padded={false}>
        <Table rowKey={(c) => c.key} rows={[ballots, duplicates].filter(Boolean)} columns={[
          { key: 'label', label: 'Check', render: (c) => <span className="font-medium">{c.label}</span> },
          { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          { key: 'detail', label: 'Evidence', className: 'text-slate-600' },
        ]} />
      </Card>
      <Card title="Rejected ballot submissions by reason" padded={false}>
        {trail.loading && <Loading />}
        {!can('VIEW_AUDIT_LOGS') && <p className="p-5 text-sm text-slate-600">Your role cannot read the audit trail.</p>}
        {can('VIEW_AUDIT_LOGS') && !trail.loading && (
          <Table rowKey={(r) => r.reason} rows={rejects} empty="No ballot submissions have been rejected."
            columns={[
              { key: 'reason', label: 'Reason', render: (r) => <span className="font-medium">{r.reason.replaceAll('_', ' ').toLowerCase()}</span> },
              { key: 'count', label: 'Attempts' },
            ]} />
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Counted from the election's audit trail. Failed transactions roll back completely, so they leave no ballot behind.
        </p>
      </Card>
    </div>
  );
}

export default function TrustHealth() {
  const { active, can } = useAuth();
  const orgId = active.organizationId;
  const { list, choices, selected, select } = useElectionChoice(undefined, { preferRelevant: true });
  const [tab, setTab] = useState('overview');
  const sid = selected?.id;
  const status = selected?.status;
  const hasData = VOTING_DATA_STATUSES.includes(status);

  const trust = useApi(() => (sid ? Elections.trust(sid) : Promise.resolve(null)), [sid, status]);
  const readiness = useApi(() => (sid ? Elections.readiness(sid) : Promise.resolve(null)), [sid, status]);
  const progress = useApi(() => (sid && hasData ? Elections.participation(sid).catch(() => null) : Promise.resolve(null)), [sid, status]);
  const aggregation = useApi(() => (sid && hasData && can('VERIFY_INTEGRITY') ? Elections.aggregation(sid).catch(() => null) : Promise.resolve(null)), [sid, status]);
  const bulletin = useApi(() => (sid && hasData ? Elections.bulletin(sid, 0).catch(() => null) : Promise.resolve(null)), [sid, status]);
  const chain = useAction();
  const [chainResult, setChainResult] = useState(null);

  const header = (
    <PageHeader title="Election trust & system health" subtitle="Integrity, verification and operational status derived from recomputed checks."
      actions={<ElectionSelect choices={choices} selected={selected} onSelect={select} />} />
  );
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!selected) return <div>{header}<EmptyState title="No elections yet" /></div>;

  const t = trust.data;
  const verdict = t ? trustVerdict(t) : null;
  const c = countChecks(t?.checks);
  const check = (key) => t?.checks.find((x) => x.key === key);
  const rerun = () => { trust.reload(); readiness.reload(); progress.reload(); aggregation.reload(); bulletin.reload(); };

  return (
    <div className="space-y-6">
      {header}
      {trust.error && <ErrorState message={trust.error} onRetry={trust.reload} />}
      {trust.loading && !t && <Loading label="Running integrity checks…" />}
      {t && verdict && <VerdictBanner verdict={verdict} election={selected} />}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && t && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard icon="checkCircle" label="Votes validated" value={t.acceptedBallots}
              hint={aggregation.data ? `Aggregation ${aggregation.data.valid ? 'consistent' : 'INCONSISTENT'} (${aggregation.data.ballotsChecked} checked) · ${check('ballots')?.status.replace('_', ' ')}` : `Accounting check: ${check('ballots')?.status.replace('_', ' ')}`}
              tone={aggregation.data && !aggregation.data.valid ? 'red' : undefined} />
            <StatCard icon="person" label="Duplicate prevention" value={`${t.duplicateRejections} rejected`}
              hint={`${t.spentTokens} spent token(s) vs ${t.acceptedBallots} ballot(s): ${check('ballots')?.status === 'PASS' ? 'one credential per ballot holds' : check('ballots')?.status.replace('_', ' ')}`} />
            <StatCard icon="lock" label="Anonymity controls" value="By design" hint="Not re-verified at runtime; see warnings below" />
            <StatCard icon="shield" label="Hash integrity" value={check('bulletin')?.status === 'PASS' && check('audit')?.status === 'PASS' ? 'Verified' : [check('bulletin'), check('audit')].some((x) => x?.status === 'FAIL') ? 'Failure' : 'Incomplete'}
              tone={[check('bulletin'), check('audit')].some((x) => x?.status === 'FAIL') ? 'red' : undefined} hint="Bulletin chain and audit chain, recomputed now" />
            <StatCard icon="activity" label="Audit completion" value={`${c.pass}/${c.total}`} hint={`${c.fail} failed · ${c.warn} warning · ${c.notRun} not run`} />
            <StatCard icon="speed" label="System health" value="See tab" hint="Backend availability is measured separately" to={undefined} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <Card title="Rule behind this status">
              <p className="text-sm text-slate-700">{TRUST_RULE}</p>
              <p className="mt-3 text-sm text-slate-600">No numeric trust score is shown: a single number would hide which check is incomplete.</p>
            </Card>
            <Card title="Check outcomes"><CheckStatusChart pass={c.pass} warn={c.warn} fail={c.fail} notRun={c.notRun} /></Card>
          </div>
        </div>
      )}

      {tab === 'integrity' && t && (
        <div className="space-y-6">
          <Card title="Integrity checks" padded={false} actions={<Button size="sm" variant="secondary" onClick={rerun}>Re-run checks</Button>}>
            <Table rowKey={(x) => x.key} rows={t.checks} columns={[
              { key: 'label', label: 'Check', render: (x) => <span className="font-medium text-navy-900">{x.label}</span> },
              { key: 'status', label: 'Status', render: (x) => <StatusBadge status={x.status} /> },
              { key: 'detail', label: 'Evidence', className: 'text-slate-600' },
            ]} />
          </Card>
          {can('VERIFY_INTEGRITY') && (
            <Card title="Organization audit chain" actions={<Button busy={chain.busy} onClick={async () => setChainResult(await chain.run(() => Audit.verify(orgId)))}>Run verification</Button>}>
              {chain.error && <Alert kind="error">{chain.error}</Alert>}
              {chainResult ? <ChainResult result={chainResult} /> : <p className="text-sm text-slate-600">Recomputes the organization's whole audit chain on demand. Each run is itself recorded.</p>}
            </Card>
          )}
          {t.warnings.length > 0 && (
            <Card title="Unresolved warnings"><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{t.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Card>
          )}
        </div>
      )}

      {tab === 'voting' && t && <VotingIntegrity election={selected} trust={t} />}

      {tab === 'verification' && t && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Receipts issued" value={t.receipts} />
            <StatCard label="Verification lookups" value={t.receiptVerifications} hint="Performed by voters and auditors" />
            <StatCard label="Bulletin entries" value={bulletin.data ? bulletin.data.chain.entries : hasData ? '…' : '—'} />
            <StatCard label="Bulletin chain" value={bulletin.data ? (bulletin.data.chain.valid ? 'Verified' : 'Failed') : '—'} tone={bulletin.data && !bulletin.data.chain.valid ? 'red' : undefined} />
          </div>
          <Card title="Verification evidence" padded={false}>
            <Table rowKey={(x) => x.key} rows={['receipts', 'bulletin', 'results'].map(check).filter(Boolean)} columns={[
              { key: 'label', label: 'Check', render: (x) => <span className="font-medium">{x.label}</span> },
              { key: 'status', label: 'Status', render: (x) => <StatusBadge status={x.status} /> },
              { key: 'detail', label: 'Evidence', className: 'text-slate-600' },
            ]} />
          </Card>
          <p className="text-sm text-slate-600">
            Voters check their own receipt in the <Link className="font-medium text-navy-700" to="/app/verify">verification portal</Link>;
            “counted” is only reported when results were computed over a bulletin board containing the ballot.
          </p>
        </div>
      )}

      {tab === 'readiness' && (
        <Card title="Readiness" padded={false} actions={readiness.data && <Badge tone={readiness.data.ready ? 'green' : 'amber'}>{readiness.data.score}% of required checks passed{readiness.data.nextStatus ? ` for ${readiness.data.nextStatus}` : ''}</Badge>}>
          {readiness.loading && <Loading />}
          {readiness.error && <div className="p-5"><ErrorState message={readiness.error} onRetry={readiness.reload} /></div>}
          {readiness.data && (
            <Table rowKey={(x) => x.key} rows={readiness.data.checks} empty="No readiness checks apply at this stage." columns={[
              { key: 'label', label: 'Requirement', render: (x) => <span className="font-medium">{x.label}</span> },
              { key: 'passed', label: 'Status', render: (x) => <StatusBadge status={x.passed ? 'PASS' : 'FAIL'} /> },
              { key: 'detail', label: 'Detail', className: 'text-slate-600' },
            ]} />
          )}
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            The score is the share of checks that gate the next stage and currently pass. Fix failing items in{' '}
            <Link className="font-medium text-navy-700" to={`/app/rules?election=${selected.id}`}>Election rules</Link> or{' '}
            <Link className="font-medium text-navy-700" to={`/app/approvals?election=${selected.id}`}>Candidate approvals</Link>.
          </p>
        </Card>
      )}

      {tab === 'health' && <SystemHealth electionLoaded={Boolean(t)} />}

      {tab === 'report' && t && verdict && (
        <Card title="Trust report" actions={(
          <span className="no-print flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => downloadCsv(`trust-report-${selected.id}-${fileStamp()}.csv`, [
              { label: 'Check', value: (x) => x.label }, { label: 'Status', value: (x) => x.status }, { label: 'Evidence', value: (x) => x.detail },
            ], t.checks)}>Export CSV</Button>
            <Button size="sm" variant="secondary" onClick={() => downloadJson(`trust-report-${selected.id}-${fileStamp()}.json`, { generatedAt: new Date().toISOString(), verdict: verdict.key, rule: TRUST_RULE, report: t })}>Export JSON</Button>
            <Button size="sm" onClick={printPage}>Print / PDF</Button>
          </span>
        )}>
          <DefinitionList items={[
            ['Election', t.title],
            ['Stage', t.status],
            ['Trust status', verdict.label],
            ['Generated', formatDateTime(new Date().toISOString())],
            ['Accepted ballots', t.acceptedBallots],
            ['Credentials issued / spent', `${t.credentialsIssued} / ${t.spentTokens}`],
            ['Duplicates rejected', t.duplicateRejections],
            ['Receipt lookups', t.receiptVerifications],
          ]} />
          <h3 className="mt-6 text-sm font-semibold text-navy-900">Checks</h3>
          <Table rowKey={(x) => x.key} rows={t.checks} columns={[
            { key: 'label', label: 'Check' },
            { key: 'status', label: 'Status', render: (x) => <StatusBadge status={x.status} /> },
            { key: 'detail', label: 'Evidence', className: 'text-slate-600' },
          ]} />
          <h3 className="mt-6 text-sm font-semibold text-navy-900">Anonymity controls (design, not a runtime check)</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{ANONYMITY_DESIGN.map((a) => <li key={a}>{a}</li>)}</ul>
          <h3 className="mt-6 text-sm font-semibold text-navy-900">Unresolved warnings</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{t.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          <p className="mt-6 text-xs text-slate-500">Status rule: {TRUST_RULE} This report is a platform summary, not a legal or cryptographic certification.</p>
        </Card>
      )}
    </div>
  );
}
