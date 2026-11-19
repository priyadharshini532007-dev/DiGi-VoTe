import { Link, useSearchParams } from 'react-router-dom';
import { Candidates, Elections, Notifications } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import AuthImage from '../../components/AuthImage.jsx';
import Icon from '../../components/icons.jsx';
import { ArtImage, HeroBanner } from '../../components/Hero.jsx';
import { RingChart } from '../../components/Charts.jsx';
import { notificationCategory } from '../../components/shell/NotificationBell.jsx';
import { CountBox, FeedRow, Pill, Section, useNow } from '../../components/dashboardParts.jsx';
import {
  Alert, EmptyState, ErrorState, Field, IconTile, Loading, PageHeader, Select, StatCard, StatusBadge, Stepper,
} from '../../components/ui.jsx';
import { STATUS_ORDER, formatDate, formatDateTime, timeAgo } from '../../lib/format.js';
import { milestones, profileCompleteness } from '../../lib/elections.js';

export function applicationSteps(status) {
  const base = [
    { key: 'SUBMITTED', label: 'Submitted', hint: 'Application received' },
    { key: 'REVIEWED', label: 'Reviewed', hint: 'An administrator decides' },
    { key: 'APPROVED', label: 'Approved', hint: 'Appears on the ballot' },
  ];
  if (status === 'APPROVED') return { steps: base, current: 'APPROVED' };
  if (status === 'REJECTED') return { steps: [base[0], base[1], { key: 'REJECTED', label: 'Rejected', hint: 'Not on the ballot', failed: true }], current: 'REJECTED' };
  if (status === 'CORRECTION_REQUESTED') return { steps: [base[0], { key: 'REVIEWED', label: 'Correction requested', hint: 'Revise and resubmit', failed: true }, base[2]], current: 'REVIEWED' };
  if (status === 'WITHDRAWN') return { steps: [base[0], base[1], { key: 'WITHDRAWN', label: 'Withdrawn', failed: true }], current: 'WITHDRAWN' };
  return { steps: base, current: 'SUBMITTED' };
}

function excerpt(text, max = 140) {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Where each missing profile item is edited. */
const FIX_LINK = {
  Qualifications: '/app/candidate/profile',
  Achievements: '/app/candidate/profile',
  Photograph: '/app/candidate/profile',
  Vision: '/app/candidate/manifesto',
  Mission: '/app/candidate/manifesto',
  Goals: '/app/candidate/manifesto',
  'Proposed schemes': '/app/candidate/manifesto',
  'Manifesto published': '/app/candidate/manifesto',
};

function Countdown({ to, now }) {
  const ms = new Date(to).getTime() - now;
  if (!to || Number.isNaN(ms)) return <p className="text-sm text-slate-500">Voting time not scheduled.</p>;
  if (ms <= 0) return <p className="text-sm text-slate-600">Voting has started.</p>;
  const s = Math.floor(ms / 1000);
  return (
    <div className="flex gap-2" role="timer" aria-label="Time until voting starts">
      <CountBox value={Math.floor(s / 86400)} unit="Days" />
      <CountBox value={Math.floor((s % 86400) / 3600)} unit="Hours" />
      <CountBox value={Math.floor((s % 3600) / 60)} unit="Minutes" />
      <CountBox value={s % 60} unit="Seconds" />
    </div>
  );
}

export default function CandidateOverview() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const now = useNow();
  const apps = useApi(() => Candidates.myApplications(), []);
  const wanted = params.get('application');
  const list = apps.data ?? [];
  const app = list.find((a) => String(a.id) === wanted) ?? list.find((a) => a.status === 'APPROVED') ?? list[0] ?? null;
  const candidate = useApi(() => (app?.candidateId ? Candidates.get(app.candidateId) : Promise.resolve(null)), [app?.candidateId]);
  const election = useApi(() => (app ? Elections.get(app.electionId) : Promise.resolve(null)), [app?.electionId]);
  const notices = useApi(() => Notifications.list(), []);

  if (apps.loading) return <Loading />;
  if (apps.error) return <ErrorState message={apps.error} onRetry={apps.reload} />;
  if (!app) {
    return (
      <div className="space-y-6">
        <PageHeader title="Candidate overview" subtitle="Your candidacy at a glance." />
        <EmptyState title="You have not applied to an election yet"
          action={<Link to="/app/candidacy" className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white">Find an election to apply to</Link>}>
          Applications open while an election is in its Registration stage.
        </EmptyState>
      </div>
    );
  }

  const c = candidate.data;
  const e = election.data;
  const completeness = c ? profileCompleteness(c) : null;
  const next = e ? milestones(e).filter((m) => new Date(m.at).getTime() >= now).sort((a, b) => new Date(a.at) - new Date(b.at))[0] : null;
  const progress = applicationSteps(app.status);
  const campaignLabel = e ? (STATUS_ORDER.includes(e.status) ? e.status.charAt(0) + e.status.slice(1).toLowerCase() : e.status) : '—';
  const myNotices = (notices.data?.page.content ?? []).filter((n) => ['Candidacy', 'Election'].includes(notificationCategory(n.type))).slice(0, 4);
  const manifesto = c?.manifesto;
  const first = user.fullName.split(' ')[0];
  const votingStarted = e?.rules.votingStart && new Date(e.rules.votingStart).getTime() <= now;

  return (
    <div className="space-y-5">
      <HeroBanner variant="candidate" image="hero-candidate" aside={<p className="max-w-[12rem] text-left text-lg italic text-slate-800">“A stronger community begins with your voice.”</p>}>
        <p className="text-2xl font-medium text-slate-800">Hi, {first}!</p>
        <h1 className="mt-1 text-4xl font-bold leading-tight text-white">
          <span className="block">Share Your Vision.</span>{' '}
          <span className="block text-gradient">Build a Better Tomorrow.</span>
        </h1>
        <p className="mt-4 max-w-md text-sm text-slate-800">
          Connect with voters, share your ideas and make a real impact with DigiVote.
        </p>
      </HeroBanner>

      {list.length > 1 && (
        <Field label="Application" htmlFor="app-pick">
          <Select id="app-pick" value={app.id} onChange={(ev) => setParams({ application: ev.target.value })} className="max-w-sm">
            {list.map((a) => <option key={a.id} value={a.id}>{a.electionTitle}</option>)}
          </Select>
        </Field>
      )}

      {app.status === 'CORRECTION_REQUESTED' && (
        <Alert kind="warning" title="The administrator asked for corrections">
          {app.reviewerNote} <Link className="font-medium underline" to="/app/candidacy">Revise your application</Link>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="flag" accent="purple" label="Application Status" value={<StatusBadge status={app.status} />} to="/app/candidacy" />
        <StatCard icon="person" accent="orange" label="Profile Completion" value={completeness ? `${completeness.percent}%` : '—'} loading={candidate.loading}
          hint={completeness ? (completeness.missing.length ? `Missing: ${completeness.missing.join(', ')}` : 'Everything filled in') : 'Available once approved'} to="/app/candidate/profile" />
        <StatCard icon="document" accent="blue" label="Manifesto" value={manifesto ? <StatusBadge status={manifesto.status} /> : '—'} loading={candidate.loading}
          hint={manifesto?.frozen ? 'Frozen: voting has opened' : undefined} to="/app/candidate/manifesto" />
        <StatCard icon="calendar" accent="red" label="Next Milestone" value={next ? next.label : '—'} loading={election.loading}
          hint={next ? formatDateTime(next.at) : 'No upcoming milestone'} to="/app/candidate/timeline" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Section title="Election Overview" right={e?.status === 'VOTING' ? <Pill tone="green">Live</Pill> : e ? <StatusBadge status={e.status} /> : null}>
            {election.loading && <Loading />}
            {e && (
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="flex min-w-0 gap-4">
                  <span className="relative grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-lg text-white/90"
                    style={{ backgroundImage: 'linear-gradient(135deg,#1d4ed8,#7c3aed)' }} aria-hidden="true">
                    <ArtImage name="election-1" fallback={<Icon name="building" className="h-9 w-9" />} className="absolute inset-0 h-full w-full object-cover" />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="text-lg font-semibold text-white">{e.title}</p>
                    <p className="text-navy-700">{e.organizationName}</p>
                    <ul className="mt-2 space-y-1 text-slate-700">
                      <li className="flex items-center gap-2"><Icon name="calendar" className="h-4 w-4" />{formatDate(e.rules.votingStart)} – {formatDate(e.rules.votingEnd)}</li>
                      <li className="flex items-center gap-2"><Icon name="users" className="h-4 w-4" />{e.activeCandidates} Candidates</li>
                      <li className="flex items-center gap-2"><Icon name="person" className="h-4 w-4" />{e.eligibleVoters.toLocaleString()} Eligible Voters</li>
                      {e.rules.withdrawalDeadline && <li className="flex items-center gap-2"><Icon name="flag" className="h-4 w-4" />Withdrawal deadline {formatDateTime(e.rules.withdrawalDeadline)}</li>}
                    </ul>
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-panel-2 p-4">
                  <p className="mb-2 text-center text-sm text-slate-700">{votingStarted ? 'Voting' : 'Voting Starts In'}</p>
                  <Countdown to={e.rules.votingStart} now={now} />
                  <Link to="/app/candidate/timeline" className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-brand-hover/60 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-panel-2">
                    View Election Details <Icon name="arrowRight" className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </Section>

        <Section title="My Candidate Profile" right={c ? <Link to="/app/candidate/profile" className="rounded-lg border border-line px-3 py-1 text-sm text-slate-800 hover:bg-panel-2">Edit Profile</Link> : null}>
          {!app.candidateId && <p className="text-sm text-slate-500">Your public profile is created when an administrator approves your application.</p>}
          {candidate.loading && <Loading />}
          {c && (
            <div className="flex gap-4">
              {c.photoUrl
                ? <AuthImage src={c.photoUrl} alt={`Photograph of ${c.displayName}`} className="h-24 w-24 shrink-0 rounded-full border-2 border-brand-hover object-cover" />
                : <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-2 border-brand-hover bg-accent-soft text-3xl font-semibold text-navy-800">{c.displayName[0]}</div>}
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-2 text-xl font-semibold text-white">
                  {c.displayName}
                  {app.status === 'APPROVED' && <Icon name="verified" className="h-5 w-5 text-neon-green" title="Approved candidate" />}
                </p>
                {e && <p className="text-slate-600">{e.title}<br />{e.organizationName}</p>}
                {manifesto?.vision && <p className="mt-2 italic text-slate-700">“{excerpt(manifesto.vision, 110)}”</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/app/candidates" className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">View Public Profile <Icon name="arrowRight" className="h-4 w-4" /></Link>
                  <Link to="/app/candidate/profile" className="inline-flex items-center gap-2 rounded-lg border border-brand-hover/60 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-panel-2"><Icon name="share" className="h-4 w-4" /> Share Profile</Link>
                </div>
              </div>
            </div>
          )}
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Section title="Voter Outreach" linkTo="/app/notifications" linkLabel="View All">
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {[
                ['megaphone', 'purple', 'Announcements', 'Read election announcements', 'View Announcements', '/app/notifications'],
                ['image', 'blue', 'Campaign Resources', 'Upload banners, videos and documents', 'Upload Media', '/app/candidate/media'],
                ['calendar', 'purple', 'Events', 'See election milestones and deadlines', 'View Timeline', '/app/candidate/timeline'],
                ['message', 'cyan', 'Q&A with Voters', 'Answer questions from voters', 'Not available yet', null],
              ].map(([icon, accent, title, text, cta, to]) => (
                <div key={title} className="flex flex-col rounded-xl border border-line bg-panel/60 p-3">
                  <div className="flex items-start gap-2">
                    <IconTile icon={icon} accent={accent} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="text-xs text-slate-500">{text}</p>
                    </div>
                  </div>
                  {to
                    ? <Link to={to} className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-brand-hover/60 px-2 py-1.5 text-sm font-medium text-navy-800 hover:bg-panel-2">{cta} <Icon name="arrowRight" className="h-4 w-4" /></Link>
                    : <span className="mt-3 inline-flex items-center justify-center rounded-lg border border-line px-2 py-1.5 text-sm text-slate-500">{cta}</span>}
                </div>
              ))}
            </div>
          </Section>
        <Section title="Campaign Progress" right={<StatusBadge status={app.status} />}>
          <Stepper ariaLabel="Application progress" steps={progress.steps} current={progress.current} />
          {app.reviewerNote && app.status !== 'CORRECTION_REQUESTED' && <p className="mt-4 text-sm text-slate-600"><strong>Reviewer note:</strong> {app.reviewerNote}</p>}
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {[['Vision', manifesto?.vision], ['Mission', manifesto?.mission], ['Goals', manifesto?.goals], ['Proposed schemes', manifesto?.schemes]].map(([label, value]) => (
              <li key={label} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2">
                <span className="text-slate-700">{label}</span>
                {value?.trim() ? <span className="text-emerald-700">Written</span> : <Link to="/app/candidate/manifesto" className="text-navy-700 hover:underline">Add</Link>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Campaign stage: {campaignLabel}.</p>
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Section title="Recent Activity" linkTo="/app/notifications">
          {notices.loading && <Loading />}
          {!notices.loading && myNotices.length === 0 && <p className="text-sm text-slate-500">No review decisions or deadlines to show.</p>}
          <ul>
            {myNotices.map((n) => (
              <FeedRow key={n.id} icon="bell" accent="orange" text={n.title} time={timeAgo(n.createdAt)} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Candidates cannot see voter identities, intermediate vote counts or administrative audit controls.</p>
        </Section>

        <Section title="Profile Completion">
          {completeness
            ? (
              <RingChart
                segments={[
                  { label: 'Completed', value: completeness.done, color: '#3b82f6' },
                  { label: 'Remaining', value: completeness.total - completeness.done, color: '#475a97' },
                ]}
                centerValue={`${completeness.percent}%`} centerLabel="Complete" />
            )
            : <p className="text-sm text-slate-500">Available once your application is approved.</p>}
        </Section>

        <Section title="Tips to Improve Your Campaign">
          {!completeness && <p className="text-sm text-slate-500">Tips appear once your profile exists.</p>}
          {completeness && completeness.missing.length === 0 && <p className="text-sm text-emerald-700">Your profile and manifesto are complete.</p>}
          <ul className="space-y-2">
            {(completeness?.missing ?? []).slice(0, 4).map((m) => (
              <li key={m}>
                <Link to={FIX_LINK[m] ?? '/app/candidate/profile'} className="flex items-center gap-3 rounded-lg border border-line bg-panel/60 p-2.5 hover:bg-panel-2">
                  <IconTile icon="edit" accent="blue" size="sm" />
                  <span className="min-w-0 flex-1 text-sm text-white">{m === 'Manifesto published' ? 'Publish your manifesto' : `Add your ${m.toLowerCase()}`}</span>
                  <Icon name="chevronRight" className="h-4 w-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

    </div>
  );
}
