import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Elections, Notifications } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Badge, EmptyState, ErrorState, Loading, StatCard, cx } from '../../components/ui.jsx';
import Icon from '../../components/icons.jsx';
import { ArtImage, HeroBanner } from '../../components/Hero.jsx';
import { RingChart } from '../../components/Charts.jsx';
import { FeedRow, Pill, Section } from '../../components/dashboardParts.jsx';
import { formatDate, timeAgo } from '../../lib/format.js';
import { isUpcoming } from '../../lib/elections.js';
import { getReceipt, getReceipts } from '../../lib/credentialStore.js';
import { VOTER_STATUS, voterStatusFor } from '../../lib/voterStatus.js';

const DAY = 86400000;
const FILTERS = [['ALL', 'All'], ['UPCOMING', 'Upcoming'], ['LIVE', 'Live'], ['VOTED', 'Voted']];

function daysUntil(iso, now = Date.now()) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY));
}

/** Decorative election thumbnail: no photograph is stored for an election, so this is an illustration. */
function Thumb({ seed = 0 }) {
  const hues = [['#1d4ed8', '#7c3aed'], ['#0e7490', '#2563eb'], ['#7c3aed', '#db2777'], ['#047857', '#0ea5e9']];
  const [a, b] = hues[seed % hues.length];
  return (
    <span className="relative grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg text-white/90"
      style={{ backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden="true">
      <ArtImage name={`election-${(seed % 4) + 1}`} fallback={<Icon name="building" className="h-7 w-7" />} className="absolute inset-0 h-full w-full object-cover" />
    </span>
  );
}

export default function VoterOverview() {
  const { active, user } = useAuth();
  const [filter, setFilter] = useState('ALL');
  const mine = useApi(() => Elections.mine(), []);
  const directory = useApi(() => Elections.list(active.organizationId, 0, 100), [active.organizationId]);
  const notices = useApi(() => Notifications.list(), []);

  const mineList = mine.data ?? [];

  const statuses = useMemo(() => mineList.map((e) => ({ election: e, status: voterStatusFor(e, getReceipt(e.id)) })), [mineList]);

  const first = user.fullName.split(' ')[0];
  const hero = (
    <HeroBanner variant="voter" image="hero-voter" aside={(
      <ul>
        <li>Governments</li>
        <li>Educational Institutions</li>
        <li>Organizations</li>
        <li>Communities</li>
      </ul>
    )}>
      <p className="mb-2 text-sm text-slate-600">Welcome, {first}</p>
      <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
        <span className="block">Every Vote.</span>{' '}
        <span className="block">Every Voice.</span>{' '}
        <span className="block text-gradient">A Stronger Tomorrow.</span>
      </h1>
      <p className="mt-4 max-w-md text-sm text-slate-800">
        Participate in elections, make your voice heard and be a part of the change with DigiVote.
      </p>
    </HeroBanner>
  );

  if (mine.loading) return <div className="space-y-5">{hero}<Loading /></div>;
  if (mine.error) return <div className="space-y-5">{hero}<ErrorState message={mine.error} onRetry={mine.reload} /></div>;

  const receipts = getReceipts();
  const directoryList = directory.data?.content ?? [];
  const upcomingCount = directoryList.filter((e) => isUpcoming(e)).length;
  const nextUpcoming = [...directoryList].filter((e) => isUpcoming(e))
    .sort((a, b) => new Date(a.rules.votingStart) - new Date(b.rules.votingStart))[0] ?? null;
  const nextDays = nextUpcoming ? daysUntil(nextUpcoming.rules.votingStart) : null;
  const published = directoryList.filter((e) => ['PUBLISHED', 'ARCHIVED'].includes(e.status));

  const voted = statuses.filter((s) => s.status.key === VOTER_STATUS.SUBMITTED.key);
  const notYetOpen = statuses.filter((s) => s.status.key === VOTER_STATUS.NOT_YET_OPEN.key);
  const matches = (s) => (filter === 'UPCOMING' ? s.status.key === VOTER_STATUS.NOT_YET_OPEN.key
    : filter === 'LIVE' ? s.election.status === 'VOTING' && s.status.key !== VOTER_STATUS.SUBMITTED.key
      : filter === 'VOTED' ? s.status.key === VOTER_STATUS.SUBMITTED.key : true);
  const liveCount = statuses.filter((s) => s.election.status === 'VOTING' && s.status.key !== VOTER_STATUS.SUBMITTED.key).length;
  const counts = { ALL: statuses.length, UPCOMING: notYetOpen.length, LIVE: liveCount, VOTED: voted.length };
  const shown = statuses.filter(matches);

  const eligibleIn = mineList.filter((e) => e.me?.eligibleVoter || e.me?.mayVote).length;
  const votedPct = statuses.length ? Math.round((voted.length / statuses.length) * 100) : 0;
  const notVoted = Math.max(statuses.length - voted.length - notYetOpen.length, 0);
  const reminder = [...notYetOpen].map((s) => s.election)
    .sort((a, b) => new Date(a.rules.votingStart) - new Date(b.rules.votingStart))[0] ?? null;
  const notes = notices.data?.page.content ?? [];

  return (
    <div className="space-y-5">
      {hero}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="calendar" accent="blue" label="Eligible Elections" value={mineList.length}
          hint={<span className="text-emerald-700">On your voter list</span>} to="/app/my-elections" />
        <StatCard icon="checkCircle" accent="purple" label="Votes Cast" value={receipts.length}
          hint={<span className="text-navy-700">Receipts on this device</span>} to="/app/receipts" />
        <StatCard icon="clock" accent="cyan" label="Upcoming Elections" value={directory.loading ? '…' : upcomingCount}
          hint={<span className="text-navy-700">{nextDays === null ? 'None scheduled' : nextDays === 0 ? 'Starts today' : `Starts in ${nextDays} day${nextDays === 1 ? '' : 's'}`}</span>} to="/app/directory" />
        <StatCard icon="document" accent="blue" label="Past Elections" value={directory.loading ? '…' : published.length}
          hint={<span className="text-navy-700">View results</span>} to="/app/published" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="My Elections" linkTo="/app/my-elections">
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter elections">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
                className={cx('rounded-full px-3.5 py-1 text-sm font-medium transition',
                  filter === key ? 'bg-brand text-white' : 'border border-line text-slate-700 hover:bg-panel-2')}>
                {label} ({counts[key]})
              </button>
            ))}
          </div>
          {mineList.length === 0 && <EmptyState title="You are not on any voter list yet">Your organization's election administrators add eligible voters.</EmptyState>}
          {mineList.length > 0 && shown.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No elections in this view.</p>}
          <ul className="divide-y divide-line/60">
            {shown.slice(0, 6).map(({ election: e, status }, i) => {
              const ready = status.key === VOTER_STATUS.READY.key;
              const done = ['PUBLISHED', 'ARCHIVED'].includes(e.status);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-4 py-3">
                  <Thumb seed={i} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{e.title}</p>
                    <p className="truncate text-sm text-slate-600">{e.organizationName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Icon name="calendar" className="h-3.5 w-3.5" />
                      {formatDate(e.rules.votingStart)} – {formatDate(e.rules.votingEnd)}
                      <Pill tone={status.key === VOTER_STATUS.SUBMITTED.key ? 'green' : status.tone === 'gray' ? 'gray' : status.tone}>
                        {status.key === VOTER_STATUS.SUBMITTED.key ? 'Voted' : e.status === 'VOTING' ? 'Live' : status.label}
                      </Pill>
                    </p>
                  </div>
                  {ready
                    ? <Link to={`/app/vote/${e.id}`} className="inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white hover:brightness-110">Vote Now <Icon name="arrowRight" className="h-4 w-4" /></Link>
                    : (
                      <Link to={done ? `/app/published?election=${e.id}` : `/app/e/${e.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-brand-hover/60 px-5 py-2 text-sm font-medium text-navy-800 hover:bg-panel-2">
                        {done ? 'View Results' : 'View Details'} <Icon name="arrowRight" className="h-4 w-4" />
                      </Link>
                    )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            DigiVote's server cannot tell which ballot is yours, so "Voted" is shown only when this device holds your receipt.
          </p>
        </Section>

        <div className="space-y-5">
          <Section title="Voting Progress" right={<span className="rounded-lg border border-line px-3 py-1 text-xs text-slate-700">All elections</span>}>
            <RingChart
              segments={[
                { label: 'Voted', value: voted.length, color: '#3b82f6' },
                { label: 'Upcoming', value: notYetOpen.length, color: '#8b5cf6' },
                { label: 'Not Voted', value: notVoted, color: '#475a97' },
              ]}
              centerValue={`${votedPct}%`}
              centerLabel={`${voted.length} / ${statuses.length} Elections Voted`}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 p-3">
              <div className="flex items-center gap-3">
                <Icon name="bell" className="h-6 w-6 text-neon-orange" />
                <div className="text-sm">
                  <p className="font-medium text-white">Next Election Reminder</p>
                  {reminder
                    ? <p className="text-slate-600">{reminder.title} starts in {daysUntil(reminder.rules.votingStart)} day(s)<br />{formatDate(reminder.rules.votingStart)} – {formatDate(reminder.rules.votingEnd)}</p>
                    : <p className="text-slate-600">No upcoming election on your voter list.</p>}
                </div>
              </div>
              {reminder && <Link to={`/app/e/${reminder.id}`} className="rounded-lg border border-brand-hover/60 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-panel-2">View Details</Link>}
            </div>
          </Section>

          <Section title="Your Voter Profile" right={mineList.length > 0 && eligibleIn === mineList.length ? <Pill tone="green">Verified</Pill> : null}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Icon name="verified" className="h-7 w-7" /></span>
                <p className="max-w-[16rem] text-sm text-slate-700">
                  {mineList.length === 0
                    ? 'You are not on a voter list yet.'
                    : eligibleIn === mineList.length
                      ? 'You are eligible to vote in all available elections.'
                      : `You are eligible in ${eligibleIn} of ${mineList.length} election(s).`}
                </p>
              </div>
              <Link to="/app/profile" className="inline-flex items-center gap-2 rounded-lg border border-brand-hover/60 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-panel-2">
                View Details <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            </div>
          </Section>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Section title="Recent Announcements" linkTo="/app/notifications">
          {notices.loading && <Loading />}
          {!notices.loading && notes.length === 0 && <p className="text-sm text-slate-500">No announcements or reminders yet.</p>}
          <ul>
            {notes.slice(0, 4).map((n) => (
              <FeedRow key={n.id} icon={n.type?.startsWith('RESULTS') ? 'document' : 'bell'} accent={n.type?.startsWith('RESULTS') ? 'purple' : 'orange'}
                text={<>{n.title} {!n.readAt && <Badge tone="blue">New</Badge>}</>} time={timeAgo(n.createdAt)} />
            ))}
          </ul>
        </Section>

        <Section title="Find Elections" className="relative overflow-hidden">
          <ArtImage name="find-elections" className="pointer-events-none absolute inset-y-0 right-0 h-full w-3/5 object-cover opacity-80 [mask-image:linear-gradient(to_right,transparent,#000_40%)]" />
          <p className="relative max-w-xs text-sm text-slate-700">Explore elections across governments, educational institutions, organizations and communities.</p>
          <Link to="/app/directory" className="relative mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
            Browse Elections <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </Section>

        <Section title="Need Help?">
          <ul className="divide-y divide-line/60">
            {[
              ['/guide', 'Voter Guide', 'Learn how to vote on DigiVote', 'person'],
              ['/guide', 'FAQs', 'Get answers to common questions', 'help'],
              ['/about', 'Contact Support', 'Reach out for assistance', 'users'],
            ].map(([to, title, text, icon]) => (
              <li key={title}>
                <Link to={to} className="flex items-center gap-3 py-2.5 hover:bg-panel-2">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-navy-700"><Icon name={icon} className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white">{title}</span>
                    <span className="block text-xs text-slate-500">{text}</span>
                  </span>
                  <Icon name="externalLink" className="h-4 w-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

    </div>
  );
}
