import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.jsx';

const trustReport = (checks) => ({
  electionId: 7, title: 'Council 2027', status: 'VERIFICATION', acceptedBallots: 6, credentialsIssued: 8, spentTokens: 6,
  receipts: 6, duplicateRejections: 2, receiptVerifications: 1, checks, warnings: ['Server decrypts the tally.'], overall: 'CHECKS_INCOMPLETE',
});
const election = {
  id: 7, organizationId: 1, organizationName: 'Org', title: 'Council 2027', description: '', status: 'VERIFICATION',
  updatedAt: '2027-01-01T00:00:00Z', activeCandidates: 3, eligibleVoters: 8,
  rules: { countingMethod: 'PLURALITY', votingStart: '2027-01-01T09:00:00Z', votingEnd: '2027-01-02T09:00:00Z' },
  me: { operator: true, eligibleVoter: false, mayVote: false, candidate: false, credentialIssued: false, role: 'ORG_OWNER' },
};

const mocks = vi.hoisted(() => ({
  trust: vi.fn(), list: vi.fn(), readiness: vi.fn(), participation: vi.fn(), aggregation: vi.fn(), bulletin: vi.fn(),
  notifications: vi.fn(), health: vi.fn(), roles: vi.fn(), overview: vi.fn(),
}));

vi.mock('../api/endpoints.js', () => ({
  Auth: { config: vi.fn().mockResolvedValue({ firebaseEnabled: false }) },
  Public: { health: (...a) => mocks.health(...a), elections: vi.fn().mockResolvedValue([]) },
  Elections: {
    trust: (...a) => mocks.trust(...a), list: (...a) => mocks.list(...a), readiness: (...a) => mocks.readiness(...a),
    participation: (...a) => mocks.participation(...a), aggregation: (...a) => mocks.aggregation(...a),
    bulletin: (...a) => mocks.bulletin(...a), auditTrail: vi.fn().mockResolvedValue([]),
  },
  Audit: { verify: vi.fn(), securityEvents: vi.fn().mockResolvedValue({ content: [] }), logs: vi.fn().mockResolvedValue({ content: [] }) },
  Notifications: { list: (...a) => mocks.notifications(...a), markRead: vi.fn() },
  Orgs: { roles: (...a) => mocks.roles(...a), overview: (...a) => mocks.overview(...a) },
}));

import TrustHealth from '../pages/trust/TrustHealth.jsx';
import RolesPermissions from '../pages/owner/RolesPermissions.jsx';
import AppShell from '../components/AppShell.jsx';

function signIn(role, permissions) {
  localStorage.setItem('digivote.session', JSON.stringify({
    token: 't', expiresAt: new Date(Date.now() + 3600e3).toISOString(),
    user: {
      id: 1, fullName: 'Pat Doe', email: 'p@x.test',
      memberships: [{ membershipId: 9, organizationId: 1, organizationName: 'Org', role, permissions, homePath: '/x', dashboardSections: [] }],
    },
  }));
}

function renderPage(path, element, routePath = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="app" element={<AppShell />}>
            <Route path={routePath.replace('/app/', '')} element={element} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.list.mockResolvedValue({ content: [election] });
  mocks.notifications.mockResolvedValue({ page: { content: [] }, unread: 0 });
  mocks.readiness.mockResolvedValue({ ready: true, score: 100, nextStatus: 'PUBLISHED', checks: [] });
  mocks.participation.mockResolvedValue({ eligible_voters: 8, credentials_issued: 8, accepted_ballots: 6, turnout_percent: 75, ballots_exceed_credentials: 0 });
  mocks.aggregation.mockResolvedValue({ valid: true, ballotsChecked: 6, optionsChecked: 3, commitmentMismatches: 0, malformedBallots: 0, aggregateMismatches: 0, problems: [] });
  mocks.bulletin.mockResolvedValue({ entries: { content: [], totalElements: 6, totalPages: 1 }, chain: { valid: true, entries: 6, headHash: 'abc', problems: [] } });
  mocks.health.mockResolvedValue({ status: 'UP', application: 'DigiVote' });
  mocks.roles.mockResolvedValue([]);
  mocks.overview.mockResolvedValue({ membersByRole: { ORG_OWNER: 1, VOTER: 4 } });
});

describe('Election trust & health dashboard', () => {
  it('shows "Attention required" while a check has not run and never a pass for it', async () => {
    signIn('ORG_OWNER', ['VIEW_ELECTION_INTERNALS', 'VERIFY_INTEGRITY']);
    mocks.trust.mockResolvedValue(trustReport([
      { key: 'ballots', label: 'Ballot accounting', status: 'PASS', detail: '6 ballots' },
      { key: 'receipts', label: 'Receipt verification', status: 'NOT_RUN', detail: 'none yet' },
    ]));
    renderPage('/app/trust', <TrustHealth />);
    expect(await screen.findByText('Attention required')).toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.getByText(/No numeric trust score is shown/)).toBeInTheDocument();
  });

  it('shows an integrity failure when any check fails', async () => {
    signIn('AUDITOR', ['VIEW_ELECTION_INTERNALS']);
    mocks.trust.mockResolvedValue(trustReport([
      { key: 'ballots', label: 'Ballot accounting', status: 'PASS', detail: '' },
      { key: 'bulletin', label: 'Bulletin board hash chain', status: 'FAIL', detail: 'broken at 3' },
    ]));
    renderPage('/app/trust', <TrustHealth />);
    expect(await screen.findByText('Integrity failure')).toBeInTheDocument();
  });

  it('does not invent system metrics it cannot measure', async () => {
    signIn('ORG_OWNER', ['VIEW_ELECTION_INTERNALS']);
    mocks.trust.mockResolvedValue(trustReport([{ key: 'ballots', label: 'Ballot accounting', status: 'PASS', detail: '' }]));
    renderPage('/app/trust', <TrustHealth />);
    await screen.findByText('Verified');
    await userEvent.click(screen.getByRole('tab', { name: 'System health' }));
    expect(await screen.findByText('Not measured')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('surfaces a load failure with a retry instead of a blank page', async () => {
    signIn('ORG_OWNER', ['VIEW_ELECTION_INTERNALS']);
    mocks.trust.mockRejectedValue({ response: { data: { message: 'Trust service down' } } });
    renderPage('/app/trust', <TrustHealth />);
    expect(await screen.findByText('Trust service down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Roles & permissions', () => {
  it('shows what each role can and cannot do without granting ballot access', async () => {
    signIn('ORG_OWNER', ['MANAGE_MEMBERS']);
    renderPage('/app/roles', <RolesPermissions />);
    const table = await screen.findByRole('table', { name: /Permissions held by each role/ });
    const row = within(table).getByRole('row', { name: /Publish results/ });
    expect(within(row).getAllByText('Allowed')).toHaveLength(2);
    expect(within(table).queryByText(/read ballot|decrypt/i)).not.toBeInTheDocument();
    expect(screen.getByText('No role can read or change ballots')).toBeInTheDocument();
  });
});

describe('Application shell', () => {
  it('shows an unread count, role-specific navigation and a skip link', async () => {
    signIn('AUDITOR', ['VIEW_ELECTION_INTERNALS', 'VERIFY_INTEGRITY']);
    mocks.notifications.mockResolvedValue({ page: { content: [{ id: 1, type: 'VOTING_OPEN', title: 'Voting is open', body: 'Go vote', electionId: 7, createdAt: '2027-01-01T00:00:00Z', readAt: null }] }, unread: 3 });
    mocks.trust.mockResolvedValue(trustReport([]));
    renderPage('/app/trust', <TrustHealth />);
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Dashboard' });
    expect(within(nav).getByRole('link', { name: 'Integrity Checks' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Member management/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
  });

  it('opens the notification panel and filters unread items', async () => {
    signIn('VOTER', ['CAST_VOTE']);
    mocks.notifications.mockResolvedValue({
      page: { content: [
        { id: 1, type: 'VOTING_OPEN', title: 'Voting is open', body: 'Go vote', electionId: 7, createdAt: '2027-01-01T00:00:00Z', readAt: null },
        { id: 2, type: 'RESULTS_PUBLISHED', title: 'Results published', body: 'See results', electionId: 7, createdAt: '2027-01-02T00:00:00Z', readAt: '2027-01-02T01:00:00Z' },
      ] },
      unread: 1,
    });
    mocks.trust.mockResolvedValue(trustReport([]));
    renderPage('/app/trust', <div>page</div>);
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText('Voting is open')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Results' }));
    expect(within(panel).queryByText('Voting is open')).not.toBeInTheDocument();
    expect(within(panel).getByText('Results published')).toBeInTheDocument();
  });
});
