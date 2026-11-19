import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Audit, Elections, Public, Reports as ReportsApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useFanOut } from '../../hooks/useFanOut.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ElectionSelect, useElectionChoice } from '../../components/ElectionScoped.jsx';
import Icon from '../../components/icons.jsx';
import { ArtImage, HeroBanner } from '../../components/Hero.jsx';
import { CHART_COLORS, ColorBarChart, RingChart } from '../../components/Charts.jsx';
import { FeedRow, Pill, Section } from '../../components/dashboardParts.jsx';
import { Alert, Button, ErrorState, IconTile, Input, Loading, StatCard, StatusBadge, cx } from '../../components/ui.jsx';
import { formatDate, formatDateTime, formatShort, timeAgo } from '../../lib/format.js';
import { VOTING_DATA_STATUSES, electionBucket, inSameMonth } from '../../lib/elections.js';
import { countChecks, trustVerdict } from '../../lib/trustStatus.js';
import { describeAuditEvent } from '../../lib/activity.js';
import { downloadText } from '../../lib/download.js';
import { ChainResult } from '../shared/AuditLog.jsx';
import { verifyStateFor } from '../public/VerifyReceipt.jsx';

const TABS = [['scan', 'Scan QR Code'], ['manual', 'Manual Verification'], ['batch', 'Batch Upload']];
const REPORT_META = {
  ELECTION: ['document', 'blue', 'Election Report', 'Lifecycle, rules and results'],
  PARTICIPATION: ['users', 'purple', 'Participation Report', 'Credentials and accepted ballots'],
  HEALTH: ['shield', 'orange', 'Election Integrity Report', 'Trust checks and audit evidence'],
  AUDIT: ['document', 'green', 'Audit Trail Report', 'Hash-chained audit records'],
  SECURITY: ['warning', 'red', 'Anomaly Detection Report', 'Security events and risk analysis'],
};

/** QR / ballot validation: real receipt lookup against the public bulletin board. */
function VerificationPanel() {
  const [tab, setTab] = useState('scan');
  const [code, setCode] = useState('');
  const [state, setState] = useState({ busy: false, result: null, error: null });
  const navigate = useNavigate();

  const verify = async (ev) => {
    ev.preventDefault();
    const c = code.trim();
    if (!c) return;
    setState({ busy: true, result: null, error: null });
    try {
      setState({ busy: false, result: await Public.verifyReceipt(c), error: null });
    } catch (e) {
      setState({ busy: false, result: null, error: errorMessage(e) });
    }
  };
  const result = state.result;
  const verdict = result ? verifyStateFor(result) : null;
  const ok = verdict?.kind === 'success';

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">QR / Ballot Verification</h2>
        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Verification method">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} disabled={key === 'batch'}
              title={key === 'batch' ? 'Not available yet' : undefined} onClick={() => setTab(key)}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
                tab === key ? 'bg-brand text-white' : 'border border-line text-slate-700 hover:bg-panel-2')}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'scan' && (
          <div className="rounded-xl border border-dashed border-brand-hover/50 p-6 text-center">
            <Icon name="qr" className="mx-auto h-10 w-10 text-neon-blue" />
            <p className="mt-2 text-sm text-slate-700">Click to scan or drag &amp; drop an image of a receipt QR.</p>
            <p className="text-xs text-navy-700">Supports DigiVote receipt QR codes</p>
            <button type="button" onClick={() => navigate('/app/verify')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-brand-hover/60 px-4 py-1.5 text-sm font-medium text-navy-800 hover:bg-panel-2">
              <Icon name="camera" className="h-4 w-4" /> Open Scanner
            </button>
          </div>
        )}
        {tab === 'manual' && (
          <form onSubmit={verify} className="space-y-3">
            <label htmlFor="aud-code" className="block text-sm font-medium text-slate-800">Receipt code</label>
            <Input id="aud-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter the receipt code" autoComplete="off" />
            <Button type="submit" busy={state.busy} disabled={!code.trim()}>Verify receipt</Button>
            <p className="text-xs text-slate-500">Checks the code against the public bulletin board without revealing any choice.</p>
          </form>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Verification Result</h2>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {!result && !state.error && <p className="rounded-xl border border-line bg-panel/60 p-4 text-sm text-slate-500">Verify a receipt to see its result here.</p>}
        {result && (
          <>
            <div className={cx('mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-lg font-semibold',
              ok ? 'bg-emerald-100 text-emerald-700' : verdict.kind === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
              <Icon name={verdict.icon} className="h-6 w-6" /> {verdict.title}
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              {[
                ['Receipt', <span className="mono">{code.trim()}</span>],
                ['Election', result.electionTitle ?? '—'],
                ['Status', <StatusBadge status={result.status} />],
                ['Bulletin position', result.bulletinSeq ?? 'Not yet published'],
                ['Recorded', result.recordedAtMinute ? formatDateTime(result.recordedAtMinute) : '—'],
              ].map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-slate-600">{k}</dt><dd className="text-white">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-slate-500">{result.meaning}</p>
            <Link to={`/app/verify?code=${encodeURIComponent(code.trim())}`}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-brand-hover/60 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-panel-2">
              View Audit Trail <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/** Auditor Portal dashboard (design: "Audit. Verify. Ensure Trust."). Read-only. */
export default function AuditorOverview() {
  const { active, can } = useAuth();
  const orgId = active.organizationId;
  const { list: elections, choices, selected, select } = useElectionChoice();
  const security = useApi(() => Audit.securityEvents(orgId, 0), [orgId]);
  const logs = useApi(() => Audit.logs(orgId, 0), [orgId]);
  const reports = useApi(() => ReportsApi.list(orgId), [orgId]);
  const rows = elections.data?.content ?? [];
  const withData = useMemo(() => rows.filter((e) => VOTING_DATA_STATUSES.includes(e.status)), [rows]);
  const trust = useFanOut(withData.map((e) => e.id), (id) => Elections.trust(id));
  const chainCheck = useAction();
  const download = useAction();
  const [chain, setChain] = useState(null);

  if (elections.loading && !elections.data) return <Loading />;
  if (elections.error) return <ErrorState message={elections.error} onRetry={elections.reload} />;

  const trustReports = Object.values(trust.data);
  const totals = trustReports.reduce((acc, t) => {
    const c = countChecks(t.checks);
    return { total: acc.total + c.total, pass: acc.pass + c.pass, fail: acc.fail + c.fail, warn: acc.warn + c.warn, notRun: acc.notRun + c.notRun };
  }, { total: 0, pass: 0, fail: 0, warn: 0, notRun: 0 });
  const votesVerified = trustReports.reduce((n, t) => n + (t.acceptedBallots ?? 0), 0);
  const receipts = trustReports.reduce((n, t) => n + (t.receipts ?? 0), 0);
  const lookups = trustReports.reduce((n, t) => n + (t.receiptVerifications ?? 0), 0);
  const duplicates = trustReports.reduce((n, t) => n + (t.duplicateRejections ?? 0), 0);
  const events = security.data?.content ?? [];
  const high = events.filter((e) => e.severity === 'HIGH').length;
  const flagged = totals.fail + high;
  const pct = (n) => (totals.total ? Math.round((n / totals.total) * 1000) / 10 : 0);

  const sel = selected;
  const selTrust = sel ? trust.data[sel.id] : null;
  const selVerdict = selTrust ? trustVerdict(selTrust) : null;
  const ballotsBars = withData.filter((e) => trust.data[e.id]).slice(0, 5)
    .map((e) => ({ label: e.title.length > 10 ? `${e.title.slice(0, 9)}…` : e.title, value: trust.data[e.id].acceptedBallots ?? 0 }));
  const reportList = Array.isArray(reports.data) ? reports.data : reports.data?.content ?? [];
  const logRows = (logs.data?.content ?? []).slice(0, 5);

  const downloadReport = async (r) => {
    const full = await download.run(() => ReportsApi.get(r.id));
    if (full) downloadText(`digivote-${String(r.type).toLowerCase()}-report-${r.id}.json`, JSON.stringify(full, null, 2), 'application/json');
  };

  return (
    <div className="space-y-5">
      <HeroBanner variant="auditor" image="hero-auditor">
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          <span className="block">Audit. Verify.</span>{' '}
          <span className="block text-gradient">Ensure Trust.</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-slate-800">
          Independent verification and real-time monitoring for transparent, tamper-proof elections.
        </p>
      </HeroBanner>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="building" accent="blue" label="Total Elections Audited" value={withData.length}
          hint={<span className="text-emerald-700">↑ {withData.filter((e) => inSameMonth(e.updatedAt)).length} this month</span>} to="/app/elections" />
        <StatCard icon="users" accent="purple" label="Total Votes Verified" value={trust.loading ? '…' : votesVerified.toLocaleString()}
          hint={<span className="text-emerald-700">Accepted ballots</span>} to="/app/integrity" />
        <StatCard icon="qr" accent="green" label="Receipts Issued" value={trust.loading ? '…' : receipts.toLocaleString()}
          hint={<span className="text-emerald-700">{lookups} lookup(s)</span>} to="/app/verify" />
        <StatCard icon="warning" accent="red" label="Flagged / Suspicious" value={trust.loading || security.loading ? '…' : flagged}
          hint={<span className="text-red-700">{totals.fail} failed checks · {high} high-severity</span>} to="/app/security" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
        <Section title="Election Selection">
          {choices.length === 0 ? <p className="text-sm text-slate-500">No elections to inspect.</p> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <ElectionSelect choices={choices} selected={sel} onSelect={select} label="Election" />
                {sel && <Pill tone={electionBucket(sel).tone}>{electionBucket(sel).label}</Pill>}
              </div>
              {sel && (
                <div className="flex flex-wrap gap-4">
                  <span className="relative grid h-24 w-28 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-700 to-violet-600 text-white">
                    <ArtImage name="election-1" fallback={<Icon name="building" className="h-9 w-9" />} className="absolute inset-0 h-full w-full object-cover" />
                  </span>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    <li className="font-medium text-white">{sel.organizationName}</li>
                    <li className="flex items-center gap-2"><Icon name="calendar" className="h-4 w-4" />{formatDate(sel.rules.votingStart)} – {formatDate(sel.rules.votingEnd)}</li>
                    <li className="flex items-center gap-2"><Icon name="person" className="h-4 w-4" />{sel.eligibleVoters.toLocaleString()} Eligible Voters</li>
                    <li className="flex items-center gap-2"><Icon name="users" className="h-4 w-4" />{sel.activeCandidates} Candidates</li>
                    <li className="flex items-center gap-2"><Icon name="lock" className="h-4 w-4" />Auditor Access: Read-Only</li>
                    {selVerdict && <li className="flex items-center gap-2"><Icon name="shield" className="h-4 w-4" />Trust verdict: <StatusBadge status={selVerdict.key} /></li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Section>

        <section className="glow-card min-w-0 rounded-xl p-5">
          <VerificationPanel />
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Accepted Ballots by Election" linkTo="/app/bulletin" linkLabel="Live Monitoring">
          {ballotsBars.length ? <ColorBarChart rows={ballotsBars} height="h-44" ariaLabel="Accepted ballots per election" /> : <p className="py-8 text-center text-sm text-slate-500">{trust.loading ? 'Loading…' : 'Ballot counts appear once voting has opened.'}</p>}
        </Section>

        <Section title="Integrity Checks" linkTo="/app/integrity" linkLabel="All checks">
          {totals.total === 0 ? <p className="py-8 text-center text-sm text-slate-500">{trust.loading ? 'Loading…' : 'No checks have run yet.'}</p> : (
            <RingChart size={128} centerValue={totals.total} centerLabel="Checks"
              segments={[
                { label: 'Passed', value: totals.pass, color: CHART_COLORS.green },
                { label: 'Warnings', value: totals.warn, color: CHART_COLORS.orange },
                { label: 'Failed', value: totals.fail, color: CHART_COLORS.red },
                { label: 'Not run', value: totals.notRun, color: CHART_COLORS.muted },
              ]} />
          )}
        </Section>

        <Section title="Verification Status">
          <ul className="space-y-3 text-sm">
            {[
              ['Passed checks', totals.pass, 'bg-emerald-500'],
              ['Warnings', totals.warn, 'bg-amber-500'],
              ['Failed checks', totals.fail, 'bg-red-500'],
              ['Not run', totals.notRun, 'bg-slate-400'],
            ].map(([label, n, bar]) => (
              <li key={label}>
                <div className="flex justify-between text-slate-700"><span>{label}</span><span className="font-medium text-white">{pct(n)}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className={cx('h-full rounded-full', bar)} style={{ width: `${pct(n)}%` }} /></div>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line/60 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-800">Audit hash chain · {duplicates} duplicate(s) blocked</span>
              {can('VERIFY_INTEGRITY') && (
                <Button size="sm" variant="secondary" busy={chainCheck.busy} onClick={async () => setChain(await chainCheck.run(() => Audit.verify(orgId)))}>Verify now</Button>
              )}
            </div>
            {chainCheck.error && <div className="mt-2"><Alert kind="error">{chainCheck.error}</Alert></div>}
            {chain && <div className="mt-2"><ChainResult result={chain} /></div>}
          </div>
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Recent Audit Trail" linkTo="/app/audit" bodyClassName="px-0">
          {logs.loading && <Loading />}
          {logs.error && <p className="px-5 text-sm text-slate-500">Audit logs are unavailable right now.</p>}
          {logs.data && logRows.length === 0 && <p className="px-5 text-sm text-slate-500">No audit activity recorded yet.</p>}
          {logRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line/60 text-left text-xs text-slate-500">
                    {['Time', 'Event', 'Category', 'Actor', 'Details'].map((h) => <th key={h} scope="col" className="px-4 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {logRows.map((l) => {
                    const d = describeAuditEvent(l.eventType);
                    return (
                      <tr key={l.seq} className="hover:bg-panel-2">
                        <td className="whitespace-nowrap px-4 py-2 text-slate-700">{formatShort(l.occurredAt)}</td>
                        <td className="px-4 py-2 text-white">{d.label}</td>
                        <td className="px-4 py-2"><Pill tone={d.category === 'Security' ? 'red' : 'green'}>{d.category}</Pill></td>
                        <td className="mono px-4 py-2 text-xs text-slate-600">{l.actorRef ?? 'system'}</td>
                        <td className="px-4 py-2"><Link to="/app/audit" className="text-navy-700 hover:underline">View</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title={<span className="inline-flex items-center gap-2">Anomaly Detection {events.length > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-red-600 px-1.5 text-xs text-white">{Math.min(events.length, 99)}</span>}</span>} linkTo="/app/security">
          {security.loading && <Loading />}
          {security.error && <p className="text-sm text-slate-500">Security events are unavailable right now.</p>}
          {security.data && events.length === 0 && <p className="text-sm text-slate-500">No anomalies recorded.</p>}
          <ul>
            {events.slice(0, 4).map((e) => (
              <FeedRow key={e.id} icon={e.severity === 'HIGH' ? 'error' : 'warning'} accent={e.severity === 'HIGH' ? 'red' : 'orange'}
                text={<>{e.eventType.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}<span className="block text-xs text-slate-500">{e.detail}</span></>}
                time={timeAgo(e.occurredAt)} to="/app/security" />
            ))}
          </ul>
        </Section>

        <Section title="Audit Reports" right={can('VIEW_REPORTS') ? <Link to="/app/reports" className="inline-flex items-center gap-1 rounded-lg border border-brand-hover/60 px-3 py-1 text-sm font-medium text-navy-800 hover:bg-panel-2">Generate Report <Icon name="arrowRight" className="h-4 w-4" /></Link> : null}>
          {reports.loading && <Loading />}
          {download.error && <Alert kind="error">{download.error}</Alert>}
          {!reports.loading && reportList.length === 0 && <p className="text-sm text-slate-500">No reports generated yet. Generate one to download it here.</p>}
          <ul className="space-y-2">
            {reportList.slice(0, 4).map((r) => {
              const [icon, accent, title, text] = REPORT_META[r.type] ?? ['document', 'blue', `${r.type} report`, ''];
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel/60 p-2.5">
                  <IconTile icon={icon} accent={accent} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{title}</span>
                    <span className="block truncate text-xs text-slate-500">{text} · {formatDateTime(r.generatedAt)}</span>
                  </span>
                  <button type="button" onClick={() => downloadReport(r)} disabled={download.busy} aria-label={`Download ${title}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-navy-700 hover:bg-panel-2 disabled:opacity-50">
                    JSON <Icon name="download" className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );
}
