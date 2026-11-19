import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Audit, Elections, Public } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useFanOut } from '../../hooks/useFanOut.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useElectionChoice } from '../../components/ElectionScoped.jsx';
import { ArtImage, HeroBanner } from '../../components/Hero.jsx';
import Icon from '../../components/icons.jsx';
import { AreaLineChart, CHART_COLORS, ColorBarChart, RingChart } from '../../components/Charts.jsx';
import { ActionTile, FeedRow, Pill, ProgressBar, Section, StatusRow, useNow } from '../../components/dashboardParts.jsx';
import { EmptyState, ErrorState, IconTile, Loading, StatCard } from '../../components/ui.jsx';
import { timeAgo } from '../../lib/format.js';
import {
  COMPLETED_STATUSES, VOTING_DATA_STATUSES, bucketCounts, electionBucket, inSameMonth, turnoutPercent, upcomingDeadlines,
} from '../../lib/elections.js';
import { countChecks } from '../../lib/trustStatus.js';
import { auditEventTarget, describeAuditEvent } from '../../lib/activity.js';

const METHOD_LABELS = { PLURALITY: 'Plurality', APPROVAL: 'Approval' };
const METHOD_TONE = { PLURALITY: 'purple', APPROVAL: 'green' };
const CATEGORY_ICON = {
  Elections: 'ballot', Candidates: 'users', Voting: 'person', Results: 'chart', Security: 'warning', Verification: 'qr',
  Members: 'users', Access: 'lock', Reports: 'document',
};
const CATEGORY_ACCENT = { Security: 'red', Results: 'cyan', Voting: 'blue', Elections: 'green', Candidates: 'orange', Verification: 'cyan' };
const shortDay = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const short = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Election Administrator dashboard (design: "Manage. Monitor. Ensure Fair Elections."). */
export default function OperationsOverview() {
  const { active } = useAuth();
  const now = useNow();
  const { list, selected } = useElectionChoice();
  const operated = useMemo(() => (list.data?.content ?? []).filter((e) => e.me.operator), [list.data]);
  const withData = useMemo(() => operated.filter((e) => VOTING_DATA_STATUSES.includes(e.status)), [operated]);
  const progress = useFanOut(withData.slice(0, 12).map((e) => e.id), (id) => Elections.participation(id));
  const trust = useFanOut(withData.slice(0, 6).map((e) => e.id), (id) => Elections.trust(id));
  const logs = useApi(() => Audit.logs(active.organizationId, 0), [active.organizationId]);
  const health = useApi(() => Public.health(), []);

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;

  const registered = operated.reduce((n, e) => n + e.eligibleVoters, 0);
  const liveNow = operated.filter((e) => e.status === 'VOTING').length;
  const completed = operated.filter((e) => COMPLETED_STATUSES.includes(e.status));

  const progressRows = Object.values(progress.data);
  const accepted = progressRows.reduce((n, p) => n + p.accepted_ballots, 0);
  const eligibleCounted = progressRows.reduce((n, p) => n + p.eligible_voters, 0);
  const issued = progressRows.reduce((n, p) => n + p.credentials_issued, 0);
  const pending = Math.max(eligibleCounted - issued, 0);
  const turnout = turnoutPercent(accepted, eligibleCounted);
  const pct = (n) => (eligibleCounted ? `${Math.round((n / eligibleCounted) * 100)}%` : '—');
  const trend = withData
    .filter((e) => progress.data[e.id])
    .sort((a, b) => new Date(a.rules.votingStart ?? 0) - new Date(b.rules.votingStart ?? 0))
    .slice(-6)
    .map((e) => ({ label: short(e.title, 12), value: progress.data[e.id].turnout_percent }));

  const tableRows = [...operated].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5);
  const buckets = bucketCounts(operated);

  const trustReports = Object.values(trust.data);
  const checks = trustReports.reduce((acc, t) => {
    const c = countChecks(t.checks);
    return { total: acc.total + c.total, pass: acc.pass + c.pass, fail: acc.fail + c.fail, warn: acc.warn + c.warn, notRun: acc.notRun + c.notRun };
  }, { total: 0, pass: 0, fail: 0, warn: 0, notRun: 0 });
  const duplicates = trustReports.reduce((n, t) => n + (t.duplicateRejections ?? 0), 0);
  const lookups = trustReports.reduce((n, t) => n + (t.receiptVerifications ?? 0), 0);
  const ballots = trustReports.reduce((n, t) => n + (t.acceptedBallots ?? 0), 0);

  const apiUp = health.data?.status === 'UP';
  const allOk = apiUp && progress.failed === 0 && trust.failed === 0 && !logs.error;
  const clock = new Date(now);
  const byElection = [...operated].sort((a, b) => b.eligibleVoters - a.eligibleVoters).slice(0, 5)
    .map((e) => ({ label: short(e.title, 10), value: e.eligibleVoters }));
  const methods = Object.entries(operated.reduce((m, e) => ({ ...m, [e.rules.countingMethod]: (m[e.rules.countingMethod] ?? 0) + 1 }), {}));
  const methodColors = [CHART_COLORS.cyan, CHART_COLORS.purple, CHART_COLORS.pink, CHART_COLORS.orange];
  const deadlines = upcomingDeadlines(operated, now, 5);
  const focus = selected ? `?election=${selected.id}` : '';

  return (
    <div className="space-y-5">
      <HeroBanner variant="ballot" image="hero-administrator" aside={(
        <div>
          <p>{clock.toLocaleDateString(undefined, { dateStyle: 'medium' })} &nbsp;&nbsp; {clock.toLocaleTimeString([], { hour12: false })}</p>
          <p className="inline-flex items-center gap-2 text-emerald-700">
            <span className={`h-2 w-2 rounded-full ${apiUp ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
            {health.loading ? 'Checking status' : apiUp ? 'System Secure' : 'Status unavailable'}
          </p>
        </div>
      )}>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          <span className="block text-slate-800">Manage.</span>{' '}
          <span className="block">Monitor.</span>{' '}
          <span className="block text-gradient">Ensure Fair Elections.</span>
        </h1>
        <p className="mt-4 max-w-sm text-base text-slate-800">A secure, transparent and inclusive election process with DigiVote.</p>
      </HeroBanner>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="calendar" accent="blue" label="Total Elections" value={operated.length}
          hint={<span className="text-emerald-700">↑ {operated.filter((e) => inSameMonth(e.createdAt)).length} this month</span>} to="/app/elections" />
        <StatCard icon="users" accent="purple" label="Registered Voters" value={registered.toLocaleString()}
          hint={<span className="text-emerald-700">Across {operated.length} election(s)</span>} to="/app/voters" />
        <StatCard icon="playCircle" accent="green" label="Active Elections" value={liveNow}
          hint={<span className="text-emerald-700">● Live Now</span>} to="/app/lifecycle" />
        <StatCard icon="flag" accent="blue" label="Completed Elections" value={completed.length}
          hint={<span className="text-emerald-700">↑ {completed.filter((e) => inSameMonth(e.updatedAt)).length} this month</span>} to="/app/results-management" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Ongoing Elections" linkTo="/app/elections" bodyClassName="px-0 pb-2">
          {tableRows.length === 0 ? (
            <div className="px-5"><EmptyState title="No elections yet">Create an election to get started.</EmptyState></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line/60 text-left text-xs text-slate-500">
                    {['Election Name', 'Type', 'Start Date', 'End Date', 'Progress', 'Status', 'Actions'].map((h) => (
                      <th key={h} scope="col" className="px-2.5 py-2 font-medium first:pl-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {tableRows.map((e, i) => {
                    const bucket = electionBucket(e);
                    const p = progress.data[e.id];
                    return (
                      <tr key={e.id} className="hover:bg-panel-2">
                        <td className="max-w-[12rem] py-2.5 pl-5 pr-2.5 font-medium text-white">
                          <Link to={`/app/elections/${e.id}`} className="flex items-center gap-2 hover:underline" title={e.title}>
                            <span className="relative grid h-6 w-8 shrink-0 place-items-center overflow-hidden rounded bg-gradient-to-br from-blue-700 to-violet-600">
                              <ArtImage name={`election-${(i % 4) + 1}`} fallback={<Icon name="building" className="h-3.5 w-3.5" />} className="absolute inset-0 h-full w-full object-cover" />
                            </span>
                            <span className="truncate">{e.title}</span>
                          </Link>
                        </td>
                        <td className="px-2.5 py-2.5"><Pill tone={METHOD_TONE[e.rules.countingMethod] ?? 'blue'}>{METHOD_LABELS[e.rules.countingMethod] ?? e.rules.countingMethod}</Pill></td>
                        <td className="whitespace-nowrap px-2.5 py-2.5 text-slate-700">{shortDay(e.rules.votingStart)}</td>
                        <td className="whitespace-nowrap px-2.5 py-2.5 text-slate-700">{shortDay(e.rules.votingEnd)}</td>
                        <td className="px-2.5 py-2.5">
                          {p ? <ProgressBar value={p.turnout_percent} label={`Turnout for ${e.title}`} /> : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-2.5 py-2.5"><Pill tone={bucket.tone}>{bucket.label}</Pill></td>
                        <td className="px-2.5 py-2.5">
                          <Link to={`/app/elections/${e.id}`} aria-label={`Open ${e.title}`} className="text-lg leading-none text-slate-500 hover:text-white">•••</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Election Progress" right={<span className="rounded-lg border border-line px-3 py-1 text-xs text-slate-700">Overall</span>}>
          <RingChart size={132} centerValue={operated.length} centerLabel="Total Elections"
            segments={buckets.map((b) => ({ label: b.label, value: b.value, color: b.color }))} />
        </Section>

        <Section title="Voter Participation" right={liveNow > 0 ? <Pill tone="green">Live</Pill> : null}>
          <p className="text-4xl font-bold text-white">{turnout === null ? '—' : `${Math.round(turnout)}%`}</p>
          <p className="text-sm text-slate-700">Participation Rate</p>
          {trend.length > 0
            ? <AreaLineChart points={trend} label="Turnout" height="h-32" />
            : <p className="py-6 text-center text-sm text-slate-500">{progress.loading ? 'Loading…' : 'Turnout appears once voting has opened.'}</p>}
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <Section title="Quick Actions">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            <ActionTile to="/app/elections/new" icon="add" accent="blue" title="Create New Election" text="Set up with custom rules" />
            <ActionTile to={`/app/voters${focus}`} icon="upload" accent="green" title="Add / Import Voters" text="Bulk upload via CSV/Excel" />
            <ActionTile to="/app/approvals" icon="users" accent="purple" title="Manage Candidates" text="Approve, reject or edit" />
            <ActionTile to={`/app/rules${focus}`} icon="ballot" accent="orange" title="Configure Ballot" text="Choose voting method" />
            <ActionTile to="/app/soon/polling-stations" icon="flag" accent="red" title="Assign Polling Stations" text="Map physical/online booths" unavailable />
            <ActionTile to={`/app/lifecycle${focus}`} icon="activity" accent="blue" title="View Live Monitoring" text="Real-time voting activity" />
            <ActionTile to="/app/soon/election-templates" icon="document" accent="purple" title="Election Templates" text="Reuse a saved setup" unavailable />
            <ActionTile to="/app/activity" icon="clock" accent="cyan" title="Schedule & Timeline" text="Milestones and deadlines" />
            <ActionTile to="/app/verify" icon="qr" accent="green" title="QR / Ballot Verification" text="Check a receipt code" />
            <ActionTile to="/app/trust" icon="shield" accent="red" title="Incident Management" text="Integrity checks and alerts" />
            <ActionTile to="/app/results-management" icon="chart" accent="cyan" title="Live Results" text="Generate and publish results" />
            <ActionTile to="/app/reports" icon="document" accent="orange" title="Reports & Audit Logs" text="Generate and review reports" />
          </div>
        </Section>

        <Section title="System Status"
          right={<span className={`inline-flex items-center gap-1.5 text-xs ${allOk ? 'text-emerald-700' : 'text-amber-700'}`}>
            <span className={`h-2 w-2 rounded-full ${allOk ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
            {health.loading ? 'Checking' : allOk ? 'All Systems Operational' : 'Needs attention'}
          </span>}>
          <ul className="space-y-2">
            <StatusRow icon="ballot" label="Voting Service" ok={progress.failed === 0} unknown={progress.loading} />
            <StatusRow icon="building" label="API Service" ok={apiUp} unknown={health.loading} />
            <StatusRow icon="shield" label="Verification Service" ok={trust.failed === 0} unknown={trust.loading} />
            <StatusRow icon="document" label="Audit Logging" ok={!logs.error} unknown={logs.loading} />
          </ul>
        </Section>

        <Section title="Recent Activity" linkTo="/app/audit">
          {logs.loading && <Loading />}
          {logs.error && <p className="text-sm text-slate-500">Activity is unavailable right now.</p>}
          {logs.data && (logs.data.content ?? []).length === 0 && <p className="text-sm text-slate-500">No activity recorded yet.</p>}
          <ul>
            {(logs.data?.content ?? []).slice(0, 6).map((l) => {
              const d = describeAuditEvent(l.eventType);
              return (
                <FeedRow key={l.seq} icon={CATEGORY_ICON[d.category] ?? 'activity'} accent={CATEGORY_ACCENT[d.category] ?? 'blue'}
                  text={d.label} time={timeAgo(l.occurredAt, now)} to={auditEventTarget(l, active.role) ?? undefined} />
              );
            })}
          </ul>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
        <Section title="Voter Overview" right={<span className="rounded-lg border border-line px-3 py-1 text-xs text-slate-700">All Elections</span>}>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['person', 'blue', 'Total Voters', registered.toLocaleString(), null],
              ['checkCircle', 'green', 'Credentials Issued', progress.loading ? '…' : issued.toLocaleString(), pct(issued)],
              ['clock', 'orange', 'Pending Credentials', progress.loading ? '…' : pending.toLocaleString(), pct(pending)],
            ].map(([icon, accent, label, value, share]) => (
              <div key={label} className="rounded-xl border border-line bg-panel/60 p-2.5">
                <IconTile icon={icon} accent={accent} size="sm" />
                <p className="mt-2 text-xl font-bold text-white">{value}</p>
                <p className="text-[11px] leading-tight text-slate-600">{label}</p>
                {share && <p className="text-[11px] text-slate-500">{share} of voters in voting</p>}
              </div>
            ))}
          </div>
          <p className="mb-1 mt-4 text-sm font-medium text-slate-800">Voters by Election</p>
          {byElection.length ? <ColorBarChart rows={byElection} height="h-32" ariaLabel="Eligible voters per election" /> : <p className="text-sm text-slate-500">No elections yet.</p>}
        </Section>

        <Section title="Counting Methods">
          {methods.length === 0 ? <p className="text-sm text-slate-500">No elections yet.</p> : (
            <RingChart size={130} centerValue={liveNow} centerLabel="Live Elections"
              segments={methods.map(([k, v], i) => ({ label: METHOD_LABELS[k] ?? k, value: v, color: methodColors[i % methodColors.length] }))} />
          )}
        </Section>

        <Section title="Schedule & Deadlines" linkTo="/app/activity">
          {deadlines.length === 0 && <p className="text-sm text-slate-500">No upcoming milestones.</p>}
          <ul className="divide-y divide-line/60 text-sm">
            {deadlines.map((d) => (
              <li key={`${d.electionId}-${d.key}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-white">{d.label}</span>
                  <span className="block truncate text-xs text-slate-500">{d.electionTitle}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-700">{shortDay(d.at)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Security & Integrity" linkTo="/app/trust" linkLabel="View Details">
          {trust.loading ? <Loading /> : (
            <ul className="divide-y divide-line/60 text-sm">
              {[
                ['qr', 'green', 'Accepted ballots verified', ballots.toLocaleString(), checks.total ? `${Math.round((checks.pass / checks.total) * 100)}% checks` : '—', 'text-emerald-700'],
                ['warning', 'red', 'Failed integrity checks', checks.fail, checks.fail ? 'Investigate' : 'None', 'text-red-700'],
                ['users', 'blue', 'Duplicate voting attempts', duplicates, 'Blocked', 'text-red-700'],
                ['activity', 'orange', 'Warnings / not run', checks.warn + checks.notRun, 'Under Review', 'text-navy-700'],
                ['document', 'blue', 'Receipt lookups', lookups, 'Total', 'text-slate-600'],
              ].map(([icon, accent, label, value, note, tone]) => (
                <li key={label} className="flex items-center gap-3 py-2">
                  <IconTile icon={icon} accent={accent} size="sm" />
                  <span className="min-w-0 flex-1 text-slate-800">{label}</span>
                  <span className="font-semibold text-white">{value}</span>
                  <span className={`w-24 text-right text-xs ${tone}`}>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
