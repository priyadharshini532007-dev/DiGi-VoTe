import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { NAV, homeFor } from '../components/navigation.js';

vi.mock('../api/endpoints.js', async (orig) => {
  const mod = await orig();
  return { ...mod, Public: { ...mod.Public, elections: vi.fn().mockResolvedValue([]) }, Auth: { ...mod.Auth, config: vi.fn().mockResolvedValue({ firebaseEnabled: false }) } };
});

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}

describe('navigation', () => {
  beforeEach(() => localStorage.clear());

  it('renders the DigiVote landing page', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Every Vote. Every Voice. A Stronger Tomorrow.' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/VoteVeil/i);
  });

  it('redirects unauthenticated dashboard visits to sign in', () => {
    renderAt('/app/elections');
    expect(screen.getByRole('heading', { name: 'Sign in to DigiVote' })).toBeInTheDocument();
  });

  it('shows the project guide with setup steps and a searchable code map', () => {
    renderAt('/guide');
    expect(screen.getByRole('heading', { level: 1, name: 'DigiVote project guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. Run frontend + backend' })).toBeInTheDocument();
    expect(screen.getByText('Java JDK 21')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Search the code map/), { target: { value: 'BallotTransaction' } });
    expect(screen.getByText('BallotSubmissionService.java, BallotTransaction.java')).toBeInTheDocument();
    expect(screen.queryByText('OwnerOverview.jsx')).not.toBeInTheDocument();
  });

  it('shows a not-found page for unknown public routes', () => {
    renderAt('/does-not-exist');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('gives each role its own dashboard entry point', () => {
    expect(homeFor('ORG_OWNER')).toBe('/app/overview');
    expect(homeFor('ELECTION_ADMIN')).toBe('/app/operations');
    expect(homeFor('CANDIDATE')).toBe('/app/candidate');
    expect(homeFor('VOTER')).toBe('/app/voter');
    expect(homeFor('AUDITOR')).toBe('/app/auditor');
    expect(NAV.VOTER.map((n) => n.to)).not.toContain('/app/audit');
    expect(NAV.AUDITOR.map((n) => n.to)).not.toContain('/app/members');
  });

  it('never offers a role pages whose permission it does not hold', () => {
    const owner = NAV.ORG_OWNER.map((n) => n.to);
    expect(NAV.ELECTION_ADMIN.map((n) => n.to)).not.toContain('/app/members');
    expect(NAV.ELECTION_ADMIN.map((n) => n.to)).not.toContain('/app/roles');
    expect(NAV.AUDITOR.map((n) => n.to)).not.toContain('/app/voters');
    expect(NAV.AUDITOR.map((n) => n.to)).not.toContain('/app/approvals');
    expect(NAV.VOTER.map((n) => n.to)).not.toContain('/app/trust');
    expect(owner).toContain('/app/roles');
  });

  it('lets a signed-in voter reach their elections but not admin pages', async () => {
    localStorage.setItem('digivote.session', JSON.stringify({
      token: 't', expiresAt: new Date(Date.now() + 3600e3).toISOString(),
      user: { id: 1, fullName: 'V', email: 'v@x.test', memberships: [{ membershipId: 9, organizationId: 1, organizationName: 'Org', role: 'VOTER', permissions: ['CAST_VOTE'], homePath: '/voter', dashboardSections: [] }] },
    }));
    renderAt('/app/members');
    expect(await screen.findByRole('heading', { level: 1, name: 'Every Vote. Every Voice. A Stronger Tomorrow.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Member management/i })).not.toBeInTheDocument();
  });
});
