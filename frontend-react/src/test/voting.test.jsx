import { generateKeyPairSync } from 'node:crypto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CastBallot, { toggleSelection } from '../pages/voter/CastBallot.jsx';
import { Public, Voting } from '../api/endpoints.js';
import { credentialKeyFingerprint, KEY_PROTOCOL, KEY_VERSION } from '../crypto/keyTransparency.js';
import { modPow, hexToBigInt } from '../crypto/blindRsa.js';

vi.mock('../api/endpoints.js', () => ({
  Public: { credentialKey: vi.fn() },
  Voting: {
    eligibility: vi.fn(), credentialKey: vi.fn(), issueCredential: vi.fn(), ballot: vi.fn(), castBallot: vi.fn(),
  },
  Candidates: { mediaBlob: vi.fn() },
}));

const big = (b64) => BigInt('0x' + Buffer.from(b64, 'base64url').toString('hex'));

async function publishedKey(electionId = '7') {
  const jwk = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' });
  const modulusHex = big(jwk.n).toString(16);
  const key = { electionId, version: KEY_VERSION, protocol: KEY_PROTOCOL, modulusHex, publicExponentHex: '10001',
    fingerprint: await credentialKeyFingerprint(electionId, modulusHex, '10001') };
  return { key, n: big(jwk.n), d: big(jwk.d) };
}

describe('ballot selection rules', () => {
  const opts = [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3, nota: true }];
  it('single choice replaces the selection', () => {
    expect(toggleSelection([0], { ...opts[1], notaIndex: 3 }, 1)).toEqual([1]);
  });
  it('approval respects the maximum and NOTA is exclusive', () => {
    expect(toggleSelection([0], { ...opts[1], notaIndex: 3 }, 2)).toEqual([0, 1]);
    expect(toggleSelection([0, 1], { ...opts[2], notaIndex: 3 }, 2)).toEqual([0, 1]);
    expect(toggleSelection([0, 1], { ...opts[3], notaIndex: 3 }, 2)).toEqual([3]);
    expect(toggleSelection([3], { ...opts[0], notaIndex: 3 }, 2)).toEqual([0]);
    expect(toggleSelection([0, 1], { ...opts[1], notaIndex: 3 }, 2)).toEqual([0]);
  });
});

describe('voting workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('obtains a blind credential, confirms the ballot, submits it anonymously and shows the receipt', async () => {
    const { key, n, d } = await publishedKey();
    Public.credentialKey.mockResolvedValue({ ...key });

    Voting.eligibility.mockResolvedValue({ mayVote: true, votingOpen: true, credentialIssued: false, reasons: [] });
    Voting.credentialKey.mockResolvedValue(key);
    Voting.issueCredential.mockImplementation(async (_id, blindedHex) => ({
      blindSignatureHex: modPow(hexToBigInt(blindedHex), d, n).toString(16),
    }));
    Voting.ballot.mockResolvedValue({
      title: 'Council', maxSelections: 1, votingEnd: '2030-01-01T00:00:00Z',
      options: [{ index: 0, label: 'Asha' }, { index: 1, label: 'Bala' }, { index: 2, label: 'None Of The Above', nota: true }],
    });
    Voting.castBallot.mockImplementation(async (electionId, body) => ({
      electionId, electionTitle: 'Council', receiptCode: 'AAAAA-BBBBB-CCCCC-DDDDD-E', ballotCommitment: 'c'.repeat(64),
      bulletinSeq: null, status: 'ACCEPTED_PENDING_PUBLICATION', qrPngDataUri: null, replayed: false,
      echo: body,
    }));

    render(<MemoryRouter initialEntries={['/app/vote/7']}><Routes><Route path="/app/vote/:electionId" element={<CastBallot />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Obtain anonymous credential' }));
    await userEvent.click(await screen.findByText('Bala'));
    await userEvent.click(screen.getByRole('button', { name: 'Review and confirm' }));
    expect(screen.getByRole('dialog', { name: 'Confirm your vote' })).toHaveTextContent('Bala');
    await userEvent.click(screen.getByRole('button', { name: 'Cast my ballot' }));

    expect(await screen.findByText('AAAAA-BBBBB-CCCCC-DDDDD-E')).toBeInTheDocument();
    const [electionId, body] = Voting.castBallot.mock.calls[0];
    expect(electionId).toBe('7');
    expect(body.selections).toEqual([1]);
    expect(body.tokenHex).toHaveLength(64);
    expect(Object.keys(body).sort()).toEqual(['selections', 'signatureHex', 'submissionNonce', 'tokenHex']);
    // the receipt stored on the device has no selection in it
    expect(localStorage.getItem('digivote.receipts')).not.toContain('Bala');
  });

  it('explains why a voter cannot vote', async () => {
    Voting.eligibility.mockResolvedValue({ mayVote: false, votingOpen: true, reasons: ['You are not on the eligible voter list for this election'] });
    render(<MemoryRouter initialEntries={['/app/vote/7']}><Routes><Route path="/app/vote/:electionId" element={<CastBallot />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('You are not on the eligible voter list for this election')).toBeInTheDocument();
  });

  it('refuses to fake a second credential when the server already issued one', async () => {
    Voting.eligibility.mockResolvedValue({ mayVote: true, votingOpen: true, reasons: [] });
    const { key } = await publishedKey();
    Voting.credentialKey.mockResolvedValue(key);
    Public.credentialKey.mockResolvedValue({ ...key });
    Voting.issueCredential.mockRejectedValue({ response: { data: { code: 'CREDENTIAL_ALREADY_ISSUED', message: 'x' } } });
    render(<MemoryRouter initialEntries={['/app/vote/7']}><Routes><Route path="/app/vote/:electionId" element={<CastBallot />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Obtain anonymous credential' }));
    expect(await screen.findByText(/cannot issue a second one/)).toBeInTheDocument();
  });

  it('fails closed when this voter receives a different key than the published one', async () => {
    Voting.eligibility.mockResolvedValue({ mayVote: true, votingOpen: true, reasons: [] });
    const published = await publishedKey();
    const substituted = await publishedKey();
    Voting.credentialKey.mockResolvedValue(substituted.key);
    Public.credentialKey.mockResolvedValue(published.key);
    render(<MemoryRouter initialEntries={['/app/vote/7']}><Routes><Route path="/app/vote/:electionId" element={<CastBallot />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Obtain anonymous credential' }));
    expect(await screen.findByText(/differs from the election.s published key/)).toBeInTheDocument();
    expect(Voting.issueCredential).not.toHaveBeenCalled();
  });
});
