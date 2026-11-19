import { Link } from 'react-router-dom';
import { Audit, Elections, Orgs, Public } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useFanOut } from '../../hooks/useFanOut.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { HeroBanner } from '../../components/Hero.jsx';
import { AreaLineChart, ColorBarChart, RingChart } from '../../components/Charts.jsx';
import { ActionTile, FeedRow, Pill, Section, StatusRow, useNow } from '../../components/dashboardParts.jsx';
import { EmptyState, ErrorState, Loading, StatCard } from '../../components/ui.jsx';
import { formatDate, timeAgo } from '../../lib/format.js';
import { COMPLETED_STATUSES, VOTING_DATA_STATUSES, bucketCounts, electionBucket, inSameMonth } from '../../lib/elections.js';
import { auditEventTarget, describeAuditEvent } from '../../lib/activity.js';

const METHOD_LABELS = { PLURALITY: 'Plurality', APPROVAL: 'Approval' };
const METHOD_TONE = { PLURALITY: 'purple', APPROVAL: 'green' };
const CATEGORY_ICON = {
  Elections: 'ballot', Candidates: 'users', Voting: 'upload', Results: 'chart', Security: 'warning', Verification: 'shield',
  Members: 'users', Access: 'lock', Reports: 'document', Organization: 'building',
};
const CATEGORY_ACCENT = { Security: 'red', Results: 'purple', Voting: 'green', Elections: 'blue', Candidates: 'red', Verification: 'cyan', Members: 'purple' };
const short = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Organizer Panel dashboard (design: "Welcome back, <name>"). */
export default function OwnerOverview() {
  const { active, user } = useAuth();
  const now = useNow(30000);
  const orgId = active.organizationId;
  const overview = useApi(() => Orgs.overview(orgId), [orgId]);
  const elections = useApi(() => Elections.list(orgId, 0, 100), [orgId]);
  const logs = useApi(() => Audit.logs(orgId, 0), [orgId]);
  const health = useApi(() => Public.health(), []);
  const rows = elections.data?.content ?? [];
  const withData = rows.filter((e) => VOTING_DATA_STATUSES.includes(e.status));
  const progress = useFanOut(withData.slice(0, 12).map((e) => e.id), (id) => Elections.participation(id));

  if (overview.loading || (elections.loading && !elections.data)) return <Loading />;
  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;
  if (elections.error) return <ErrorState message={elections.error} onRetry={elections.reload} />;

  const buckets = bucketCounts(rows);
  const count = (key) => buckets.find((b) => b.key === key)?.value ?? 0;
  const completed = rows.filter((e) => COMPLETED_STATUSES.includes(e.status));
  const registered = rows.reduce((n, e) => n + e.eligibleVoters, 0);
  const recentRows = [...rows].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5);
  const trend = withData
    .filter((e) => progress.data[e.id])
    .sort((a, b) => new Date(a.rules.votingStart ?? 0) - new Date(b.rules.votingStart ?? 0))
    .slice(-8)
    .map((e) => ({ label: short(e.title, 14), value: progress.data[e.id].turnout_percent }));
  const distribution = [...rows].sort((a, b) => b.eligibleVoters - a.eligibleVoters).slice(0, 4)
    .map((e) => ({ label: short(e.title, 11), value: e.eligibleVoters }));
  const activity = (logs.data?.content ?? []).slice(0, 5);
  const apiUp = health.data?.status === 'UP';
  const allOk = apiUp && progress.failed === 0 && !logs.error && !elections.error;

  return (
    <div className="space-y-5">
      <HeroBanner variant="ballot" image="hero-organizer">
        <p className="text-3xl font-semibold text-slate-800">Welcome back,</p>
        <h1 className="text-4xl font-bold leading-tight text-gradient sm:text-5xl">{user.fullName}</h1>
        <p className="mt-4 max-w-sm text-base text-slate-800">Manage, monitor and conduct secure elections with DigiVote.</p>
      </HeroBanner>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="ballot" accent="blue" label="Total Elections" value={rows.length}
          hint={<span className="text-emerald-700">↑ {rows.filter((e) => inSameMonth(e.createdAt)).length} this month</span>} to="/app/elections" />
        <StatCard icon="users" accent="purple" label="Registered Voters" value={registered.toLocaleString()}
          hint={<span className="text-emerald-700">Across {rows.length} election(s)</span>} to="/app/voters" />
        <StatCard icon="playCircle" accent="cyan" label="Ongoing Elections" value={count('LIVE')}
          hint={<span className="text-emerald-700">● Live Now</span>} to="/app/lifecycle" />
        <StatCard icon="flag" accent="blue" label="Completed Elections" value={completed.length}
          hint={<span className="text-emerald-700">↑ {completed.filter((e) => inSameMonth(e.updatedAt)).length} this month</span>} to="/app/archive" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Section title="Recent Elections" linkTo="/app/elections" bodyClassName="px-0 pb-2">
          {recentRows.length === 0 ? (
            <div className="px-5"><EmptyState title="No elections yet">Create one to get started.</EmptyState></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line/60 text-left text-xs text-slate-500">
                    {['Election Name', 'Type', 'Start Date', 'End Date', 'Status', 'Actions'].map((h) => (
                      <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {recentRows.map((e) => {
                    const bucket = electionBucket(e);
                    return (
                      <tr key={e.id} className="hover:bg-panel-2">
                        <td className="px-4 py-3">
                          <Link to={`/app/elections/${e.id}`} className="flex items-center gap-3 font-medium text-white hover:underline">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-navy-700"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M12 7V3H2v18h20V7H12z" /></svg></span>
                            <span className="truncate">{e.title}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3"><Pill tone={METHOD_TONE[e.rules.countingMethod] ?? 'blue'}>{METHOD_LABELS[e.rules.countingMethod] ?? e.rules.countingMethod}</Pill></td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(e.rules.votingStart)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(e.rules.votingEnd)}</td>
                        <td className="px-4 py-3"><Pill tone={bucket.tone}>{bucket.label}</Pill></td>
                        <td className="px-4 py-3"><Link to={`/app/elections/${e.id}`} aria-label={`Open ${e.title}`} className="text-lg leading-none text-slate-500 hover:text-white">•••</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <div className="space-y-5">
          <Section title="Voter Participation" right={<span className="rounded-lg border border-line px-3 py-1 text-xs text-slate-700">By election</span>}>
            {trend.length > 0
              ? <AreaLineChart points={trend} label="Turnout" height="h-40" />
              : <p className="py-10 text-center text-sm text-slate-500">{progress.loading ? 'Loading…' : 'Turnout appears once voting has opened.'}</p>}
          </Section>
          <div className="grid gap-5 sm:grid-cols-2">
            <Section title="Election Status">
              <RingChart size={120} centerValue={rows.length} centerLabel="Total"
                segments={buckets.map((b) => ({ label: b.label, value: b.value, color: b.color }))} />
            </Section>
            <Section title="Voter Distribution">
              {distribution.length ? <ColorBarChart rows={distribution} height="h-36" ariaLabel="Eligible voters per election" /> : <p className="text-sm text-slate-500">No elections yet.</p>}
            </Section>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Section title="Quick Actions">
          <div className="space-y-2.5">
            <ActionTile to="/app/elections/new" icon="add" accent="blue" title="Create Election" text="Set up a new election with custom rules" />
            <ActionTile to="/app/approvals" icon="users" accent="purple" title="Manage Candidates" text="Add, edit or review candidates" />
            <ActionTile to="/app/voters" icon="upload" accent="cyan" title="Import Voters" text="Bulk add voters via CSV/Excel" />
            <ActionTile to="/app/results" icon="chart" accent="orange" title="View Results" text="See analytics and generate reports" />
          </div>
        </Section>

        <Section title="Recent Activity" linkTo="/app/audit">
          {logs.loading && <Loading />}
          {logs.error && <p className="text-sm text-slate-500">Activity is unavailable right now.</p>}
          {logs.data && activity.length === 0 && <p className="text-sm text-slate-500">No activity recorded yet.</p>}
          <ul>
            {activity.map((l) => {
              const d = describeAuditEvent(l.eventType);
              return (
                <FeedRow key={l.seq} icon={CATEGORY_ICON[d.category] ?? 'activity'} accent={CATEGORY_ACCENT[d.category] ?? 'blue'}
                  text={d.label} time={timeAgo(l.occurredAt, now)} to={auditEventTarget(l, active.role) ?? undefined} />
              );
            })}
          </ul>
        </Section>

        <Section title="System Status"
          right={<span className={`inline-flex items-center gap-1.5 text-xs ${allOk ? 'text-emerald-700' : 'text-amber-700'}`}>
            <span className={`h-2 w-2 rounded-full ${allOk ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
            {health.loading ? 'Checking' : allOk ? 'All Systems Operational' : 'Needs attention'}
          </span>}>
          <ul className="space-y-2">
            <StatusRow icon="ballot" label="Voting Service" ok={progress.failed === 0} unknown={progress.loading} />
            <StatusRow icon="building" label="API Service" ok={apiUp} unknown={health.loading} />
            <StatusRow icon="shield" label="Election Records" ok={!elections.error} unknown={elections.loading} />
            <StatusRow icon="document" label="Audit Logs" ok={!logs.error} unknown={logs.loading} />
          </ul>
        </Section>
      </div>
    </div>
  );
}
