export const ACTIVE_STATUSES = ['REGISTRATION', 'CAMPAIGN', 'VOTING', 'VERIFICATION'];
export const COMPLETED_STATUSES = ['PUBLISHED', 'ARCHIVED'];
export const VOTING_DATA_STATUSES = ['VOTING', 'VERIFICATION', 'PUBLISHED', 'ARCHIVED'];

export function isActive(election) {
  return ACTIVE_STATUSES.includes(election.status);
}

export function isCompleted(election) {
  return COMPLETED_STATUSES.includes(election.status);
}

export function isUpcoming(election, now = Date.now()) {
  const start = election.rules?.votingStart;
  return ['DRAFT', 'REGISTRATION', 'CAMPAIGN'].includes(election.status) && Boolean(start) && new Date(start).getTime() > now;
}

/**
 * Dashboard grouping of the seven lifecycle stages:
 * Draft, Upcoming (registration or campaign), Live (voting open), Verification (voting closed), Completed.
 */
export const BUCKETS = {
  DRAFT: { key: 'DRAFT', label: 'Draft', color: '#f59e0b', tone: 'gray' },
  UPCOMING: { key: 'UPCOMING', label: 'Upcoming', color: '#3b82f6', tone: 'blue' },
  LIVE: { key: 'LIVE', label: 'Live', color: '#22c55e', tone: 'green' },
  VERIFICATION: { key: 'VERIFICATION', label: 'Verification', color: '#22d3ee', tone: 'amber' },
  COMPLETED: { key: 'COMPLETED', label: 'Completed', color: '#8b5cf6', tone: 'purple' },
};

export function electionBucket(election) {
  switch (election.status) {
    case 'DRAFT': return BUCKETS.DRAFT;
    case 'REGISTRATION':
    case 'CAMPAIGN': return BUCKETS.UPCOMING;
    case 'VOTING': return BUCKETS.LIVE;
    case 'VERIFICATION': return BUCKETS.VERIFICATION;
    default: return BUCKETS.COMPLETED;
  }
}

/** Counts per bucket, in display order, omitting empty "Verification" so the legend matches the design. */
export function bucketCounts(elections) {
  const counts = Object.fromEntries(Object.keys(BUCKETS).map((k) => [k, 0]));
  elections.forEach((e) => { counts[electionBucket(e).key] += 1; });
  return ['LIVE', 'UPCOMING', 'VERIFICATION', 'COMPLETED', 'DRAFT']
    .filter((k) => k !== 'VERIFICATION' || counts[k] > 0)
    .map((k) => ({ ...BUCKETS[k], value: counts[k] }));
}

export function inSameMonth(value, now = new Date()) {
  if (!value) return false;
  const d = new Date(value);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

const MILESTONES = [
  ['campaignStart', 'Campaign opens'],
  ['campaignEnd', 'Campaign closes'],
  ['withdrawalDeadline', 'Candidate withdrawal deadline'],
  ['votingStart', 'Voting opens'],
  ['votingEnd', 'Voting closes'],
];

export function milestones(election) {
  return MILESTONES
    .map(([key, label]) => ({ key, label, at: election.rules?.[key] ?? null }))
    .filter((m) => m.at);
}

/** Future milestones of elections that have not finished, soonest first. */
export function upcomingDeadlines(elections, now = Date.now(), limit = 8) {
  return elections
    .filter((e) => !isCompleted(e))
    .flatMap((e) => milestones(e).map((m) => ({ ...m, electionId: e.id, electionTitle: e.title, status: e.status })))
    .filter((m) => new Date(m.at).getTime() >= now)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .slice(0, limit);
}

/** Completeness of a candidate's public information: what exists, not whether it is good. */
export function profileCompleteness(candidate) {
  const m = candidate?.manifesto;
  const checks = [
    ['Qualifications', Boolean(candidate?.qualifications?.trim())],
    ['Achievements', Boolean(candidate?.achievements?.trim())],
    ['Photograph', Boolean(candidate?.photoUrl)],
    ['Vision', Boolean(m?.vision?.trim())],
    ['Mission', Boolean(m?.mission?.trim())],
    ['Goals', Boolean(m?.goals?.trim())],
    ['Proposed schemes', Boolean(m?.schemes?.trim())],
    ['Manifesto published', m?.status === 'PUBLISHED'],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
    total: checks.length,
    done,
  };
}

/** How much of an application form is filled in (the server stores four free-text fields). */
export function applicationCompleteness(application) {
  const fields = [application.displayName, application.statement, application.qualifications, application.achievements];
  const done = fields.filter((f) => String(f ?? '').trim()).length;
  return { percent: Math.round((done / fields.length) * 100), done, total: fields.length };
}

/** Turnout with an explicit denominator: accepted ballots / eligible voters. */
export function turnoutPercent(accepted, eligible) {
  if (!eligible) return null;
  return Math.round((accepted / eligible) * 1000) / 10;
}
