/**
 * Sidebar navigation per role. This only shapes the interface: the API authorizes every request
 * independently, so hiding or showing an item never grants or removes a privilege.
 *
 * The first group of every role follows the dashboard design (same labels, same order). Items whose feature
 * does not exist yet point at `/app/soon/<feature>` and render an honest "not available yet" page.
 * The "More" group keeps the pages that are not part of the design reachable.
 */
const soon = (feature) => `/app/soon/${feature}`;

export const PORTALS = {
  ORG_OWNER: {
    name: 'Organizer Panel',
    search: 'Search elections, voters, candidates...',
    promo: { lines: ['Fair Elections', 'Stronger Communities'] },
  },
  ELECTION_ADMIN: {
    name: 'Election Administrator',
    search: 'Search elections, voters, candidates, polling stations...',
    promo: { lines: ['Transparent', 'Elections'], tail: 'Stronger Communities' },
  },
  VOTER: {
    name: 'Voter Portal',
    search: 'Search elections, candidates, or organizations...',
    promo: { lines: ['Your Vote', 'Builds', 'A Brighter', 'Tomorrow'], accentFrom: 2 },
  },
  CANDIDATE: {
    name: 'Candidate Portal',
    search: 'Search voters, election info, resources...',
    promo: { lines: ['Your Ideas.', 'Their Votes.', 'A Better Tomorrow.'], accentFrom: 2 },
  },
  AUDITOR: {
    name: 'Auditor Portal',
    search: 'Search elections, transactions, voter IDs, QR codes...',
    promo: { lines: ['Independent Audit', 'Stronger Elections'], caption: 'Verify. Validate. Report. Ensure every vote counts.' },
  },
};

export const NAV_GROUPS = {
  ORG_OWNER: [
    {
      title: '',
      items: [
        { to: '/app/overview', label: 'Dashboard', icon: 'home' },
        { to: '/app/elections', label: 'Elections', icon: 'calendar' },
        { to: '/app/approvals', label: 'Candidates', icon: 'users' },
        { to: '/app/voters', label: 'Voters', icon: 'person' },
        { to: '/app/members', label: 'Voter Management', icon: 'users' },
        { to: '/app/lifecycle', label: 'Voting & Monitoring', icon: 'activity' },
        { to: '/app/results-management', label: 'Results', icon: 'chart' },
        { to: '/app/results', label: 'Analytics', icon: 'pie' },
        { to: '/app/audit', label: 'Audit Logs', icon: 'document' },
        { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
        { to: '/app/profile', label: 'Settings', icon: 'settings' },
      ],
    },
    {
      title: 'More',
      items: [
        { to: '/app/organization', label: 'Organization profile', icon: 'building' },
        { to: '/app/roles', label: 'Roles & permissions', icon: 'key' },
        { to: '/app/archive', label: 'Election archive', icon: 'archive' },
        { to: '/app/security', label: 'Security center', icon: 'lock' },
        { to: '/app/elections/new', label: 'Create election', icon: 'add' },
        { to: '/app/rules', label: 'Election rules', icon: 'key' },
        { to: '/app/trust', label: 'Trust & system health', icon: 'shield' },
        { to: '/app/reports', label: 'Reports', icon: 'document' },
        { to: '/app/my-elections', label: 'My ballots', icon: 'ballot' },
      ],
    },
  ],
  ELECTION_ADMIN: [
    { title: '', items: [{ to: '/app/operations', label: 'Dashboard', icon: 'home' }] },
    {
      title: 'Election Management',
      items: [
        { to: '/app/elections/new', label: 'Create Election', icon: 'add' },
        { to: soon('election-templates'), label: 'Election Templates', icon: 'document' },
        { to: '/app/elections', label: 'Election List', icon: 'calendar' },
        { to: '/app/activity', label: 'Schedule & Timeline', icon: 'clock' },
        { to: soon('polling-stations'), label: 'Polling Stations', icon: 'flag' },
        { to: '/app/rules', label: 'Ballot Configuration', icon: 'ballot' },
      ],
    },
    {
      title: 'People Management',
      items: [
        { to: '/app/voters', label: 'Voters', icon: 'users' },
        { to: '/app/approvals', label: 'Candidates', icon: 'users' },
        { to: soon('roles-permissions'), label: 'Roles & Permissions', icon: 'key' },
      ],
    },
    {
      title: 'Voting Operations',
      items: [
        { to: '/app/lifecycle', label: 'Live Monitoring', icon: 'checkCircle' },
        { to: '/app/verify', label: 'QR / Ballot Verification', icon: 'qr' },
        { to: '/app/trust', label: 'Incident Management', icon: 'shield' },
      ],
    },
    {
      title: 'Results & Analytics',
      items: [
        { to: '/app/results-management', label: 'Live Results', icon: 'chart' },
        { to: '/app/reports', label: 'Reports', icon: 'document' },
        { to: '/app/audit', label: 'Audit Logs', icon: 'document' },
      ],
    },
    {
      title: 'System',
      items: [
        { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
        { to: '/app/profile', label: 'Settings', icon: 'settings' },
      ],
    },
    {
      title: 'More',
      items: [
        { to: '/app/results', label: 'Analytics', icon: 'pie' },
        { to: '/app/my-elections', label: 'My ballots', icon: 'ballot' },
      ],
    },
  ],
  CANDIDATE: [
    {
      title: '',
      items: [
        { to: '/app/candidate', label: 'Dashboard', icon: 'home' },
        { to: '/app/candidate/campaign', label: 'My Campaign', icon: 'flag' },
        { to: '/app/candidate/timeline', label: 'Election Details', icon: 'checkCircle' },
        { to: soon('voter-outreach'), label: 'Voter Outreach', icon: 'users' },
        { to: '/app/notifications', label: 'Messages & Announcements', icon: 'message' },
        { to: '/app/candidate/media', label: 'Resources', icon: 'document' },
        { to: soon('analytics'), label: 'Analytics', icon: 'chart' },
        { to: '/app/candidate/manifesto', label: 'Documents', icon: 'folder' },
        { to: '/app/profile', label: 'Settings', icon: 'settings' },
      ],
    },
    {
      title: 'More',
      items: [
        { to: '/app/candidate/profile', label: 'My profile', icon: 'person' },
        { to: '/app/candidacy', label: 'Application status', icon: 'flag' },
        { to: '/app/my-elections', label: 'Vote', icon: 'ballot' },
        { to: '/app/receipts', label: 'My receipts', icon: 'qr' },
        { to: '/app/verify', label: 'Verify a vote', icon: 'shield' },
      ],
    },
  ],
  VOTER: [
    {
      title: '',
      items: [
        { to: '/app/voter', label: 'Dashboard', icon: 'home' },
        { to: '/app/my-elections', label: 'My Elections', icon: 'calendar' },
        { to: '/app/receipts', label: 'My Votes', icon: 'checkCircle' },
        { to: '/app/directory', label: 'Find Elections', icon: 'search' },
        { to: '/app/candidates', label: 'Candidate Profiles', icon: 'users' },
        { to: '/app/published', label: 'Results', icon: 'chart' },
        { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
        { to: '/app/profile', label: 'Settings', icon: 'settings' },
      ],
    },
    {
      title: 'More',
      items: [
        { to: '/app/cast', label: 'Cast vote', icon: 'ballot' },
        { to: '/app/verify', label: 'Verify a vote', icon: 'shield' },
      ],
    },
  ],
  AUDITOR: [
    {
      title: '',
      items: [
        { to: '/app/auditor', label: 'Dashboard', icon: 'home' },
        { to: '/app/elections', label: 'Election Audit', icon: 'calendar' },
        { to: '/app/verify', label: 'QR / Ballot Verification', icon: 'qr' },
        { to: '/app/bulletin', label: 'Live Vote Monitoring', icon: 'activity' },
        { to: '/app/audit', label: 'Audit Logs', icon: 'document' },
        { to: soon('voter-candidate-data'), label: 'Voter & Candidate Data', icon: 'users' },
        { to: '/app/integrity', label: 'Integrity Checks', icon: 'shield' },
        { to: '/app/reports', label: 'Reports', icon: 'document' },
        { to: '/app/security', label: 'Anomaly Detection', icon: 'warning' },
        { to: soon('access-management'), label: 'Access Management', icon: 'lock' },
        { to: '/app/trust', label: 'System Status', icon: 'speed' },
        { to: '/app/profile', label: 'Settings', icon: 'settings' },
      ],
    },
    {
      title: 'More',
      items: [
        { to: '/app/result-verification', label: 'Result verification', icon: 'check' },
        { to: '/app/results', label: 'Results & analytics', icon: 'chart' },
        { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
      ],
    },
  ],
};

/** Features shown in the design that the platform does not provide (yet). */
export const COMING_SOON = {
  'voter-outreach': {
    title: 'Voter Outreach',
    icon: 'users',
    text: 'Announcements, events and Q&A with voters are not available yet. Election notifications are listed under Messages & Announcements.',
  },
  analytics: {
    title: 'Campaign Analytics',
    icon: 'chart',
    text: 'Campaign reach and engagement analytics are not available yet. DigiVote does not track which voters view a candidate.',
  },
  'voter-candidate-data': {
    title: 'Voter & Candidate Data',
    icon: 'users',
    text: 'Ballots are unlinkable to voters by design, so auditors cannot browse voter identities. Eligibility counts and candidate lists are available per election under Election Audit.',
  },
  'election-templates': {
    title: 'Election Templates',
    icon: 'document',
    text: 'Reusable election templates are not available yet. Create an election and set its rules under Ballot Configuration.',
  },
  'polling-stations': {
    title: 'Polling Stations',
    icon: 'flag',
    text: 'DigiVote runs online elections, so physical polling stations are not part of the platform yet.',
  },
  'roles-permissions': {
    title: 'Roles & Permissions',
    icon: 'key',
    text: 'Roles are assigned by the organization owner under Roles & permissions. Election administrators cannot change roles.',
  },
  'access-management': {
    title: 'Access Management',
    icon: 'lock',
    text: 'Auditor access is read-only and assigned by the organization owner, so there is nothing for an auditor to manage here.',
  },
};

/** Flat per-role lists, kept for callers that only need destinations. */
export const NAV = Object.fromEntries(
  Object.entries(NAV_GROUPS).map(([role, groups]) => [role, groups.flatMap((g) => g.items)]),
);

/** Labels for pages every role can open (fallback for search and breadcrumbs). */
export const COMMON_NAV = [
  { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/app/profile', label: 'Settings', icon: 'settings' },
];

export function homeFor(role) {
  return NAV[role]?.[0]?.to ?? '/app/profile';
}

/** Where a given role reads about one election. */
export function electionPath(role, electionId) {
  return ['ORG_OWNER', 'ELECTION_ADMIN', 'AUDITOR'].includes(role)
    ? `/app/elections/${electionId}`
    : `/app/e/${electionId}`;
}

const EXTRA_LABELS = {
  '/app/elections/new': 'Create election',
  '/app/notifications': 'Notifications',
  '/app/profile': 'Settings',
};

/** Breadcrumb trail for a path inside the authenticated shell. */
export function crumbsFor(pathname, role) {
  const home = { label: 'Home', to: homeFor(role) };
  const flat = [...(NAV[role] ?? []), ...COMMON_NAV];
  const exact = flat.find((i) => i.to === pathname);
  if (exact) return exact.to === home.to ? [{ label: exact.label }] : [home, { label: exact.label }];
  if (EXTRA_LABELS[pathname]) return [home, { label: EXTRA_LABELS[pathname] }];

  const parent = [...flat].filter((i) => pathname.startsWith(`${i.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  const tail = pathname.split('/').pop();
  const detail = { label: /^\d+$/.test(tail) ? 'Details' : tail.replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase()) };
  if (parent) return [home, { label: parent.label, to: parent.to }, detail];
  return [home, detail];
}
