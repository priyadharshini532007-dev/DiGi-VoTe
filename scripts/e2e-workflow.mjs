#!/usr/bin/env node
// DIGI-VOTE end-to-end API workflow (the required 27-step demonstration, driven through the REST API).
//
//   node scripts/e2e-workflow.mjs [baseUrl]                 full run (default baseUrl: http://localhost:8080)
//   node scripts/e2e-workflow.mjs --prepare-demo [baseUrl]  stop once voting is open, so the rest can be shown in the UI
//
// Creates a fresh organization with random, generated passwords (printed at the end so the same
// accounts can be used in the UI). Never edits database rows directly. Exits non-zero on any failure.
import { prepareCredential, unblind, verifyCredential, randomNonceHex } from '../frontend-react/src/crypto/blindRsa.js';
import { verifyElectionCredentialKey } from '../frontend-react/src/crypto/keyTransparency.js';
import { randomBytes } from 'node:crypto';

const PREPARE = process.argv.includes('--prepare-demo');
const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || process.env.DIGIVOTE_API || 'http://localhost:8080')
  .replace(/\/$/, '');
const run = randomBytes(3).toString('hex');
const accounts = {};
let step = 0;
let failures = 0;

function genPassword() {
  return 'Dv' + randomBytes(9).toString('base64url') + '7';
}

async function api(method, path, { token, body, expect = [200, 201, 204], form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!expect.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return { status: res.status, data };
}

function ok(label, condition, detail = '') {
  step += 1;
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`${String(step).padStart(2, '0')}. [${mark}] ${label}${detail ? ' - ' + detail : ''}`);
  if (!condition) throw new Error('Step failed: ' + label);
}

async function invite(ownerToken, orgId, role, name) {
  const email = `${role.toLowerCase().replace('_', '-')}.${name.toLowerCase().replace(/\s+/g, '')}.${run}@demo.digivote.test`;
  const inv = await api('POST', `/api/orgs/${orgId}/members`, { token: ownerToken, body: { email, fullName: name, role } });
  const password = genPassword();
  const session = await api('POST', '/api/auth/activate', {
    body: { email, activationCode: inv.data.activationCode, fullName: name, password },
  });
  accounts[name] = { email, password, role };
  return { token: session.data.token, userId: session.data.user.id, email };
}

async function castVote(voter, electionId, optionIndex) {
  const key = (await api('GET', `/api/elections/${electionId}/credential-key`, { token: voter.token })).data;
  // Key transparency: the signed-in key must equal the election's published, anonymous anchor (fails closed).
  const anchor = (await api('GET', `/api/public/elections/${electionId}/credential-key`)).data;
  await verifyElectionCredentialKey(electionId, key, anchor, { pin: false });
  const prepared = await prepareCredential(key);
  const issued = (await api('POST', `/api/elections/${electionId}/credentials`, {
    token: voter.token, body: { blindedMessageHex: prepared.blindedMessageHex },
  })).data;
  const signatureHex = unblind(issued.blindSignatureHex, prepared.blindingFactorHex, key);
  const valid = await verifyCredential(prepared.tokenHex, signatureHex, key);
  const nonce = randomNonceHex();
  const receipt = (await api('POST', `/api/public/elections/${electionId}/ballots`, {
    body: { tokenHex: prepared.tokenHex, signatureHex, selections: [optionIndex], submissionNonce: nonce },
  })).data;
  return { prepared, signatureHex, valid, nonce, receipt };
}

async function main() {
  console.log(`DIGI-VOTE end-to-end workflow against ${BASE} (run ${run})\n`);
  const health = await api('GET', '/api/public/health');
  ok('Landing/API reachable', health.data.application === 'DIGI-VOTE');

  // Organization owner
  const ownerEmail = `owner.${run}@demo.digivote.test`;
  const ownerPassword = genPassword();
  const reg = await api('POST', '/api/auth/register-organization', {
    body: { organizationName: `DIGI-VOTE Demo University ${run}`, organizationDescription: 'Student council elections',
      fullName: 'Olivia Owner', email: ownerEmail, password: ownerPassword },
  });
  accounts['Olivia Owner'] = { email: ownerEmail, password: ownerPassword, role: 'ORG_OWNER' };
  const login = await api('POST', '/api/auth/login', { body: { email: ownerEmail, password: ownerPassword } });
  const owner = { token: login.data.token };
  const orgId = reg.data.user.memberships[0].organizationId;
  ok('Logged in as Organization Owner', !!owner.token, `org ${orgId}`);

  const admin = await invite(owner.token, orgId, 'ELECTION_ADMIN', 'Arjun Admin');
  ok('Created and activated an Election Administrator', !!admin.token);
  const cands = [];
  for (const name of ['Priya Candidate', 'Rahul Candidate', 'Meera Candidate']) {
    cands.push(await invite(owner.token, orgId, 'CANDIDATE', name));
  }
  const voter1 = await invite(owner.token, orgId, 'VOTER', 'Vikram Voter');
  const voter2 = await invite(owner.token, orgId, 'VOTER', 'Divya Voter');
  const auditor = await invite(owner.token, orgId, 'AUDITOR', 'Anita Auditor');

  // Election
  const election = (await api('POST', `/api/orgs/${orgId}/elections`, {
    token: admin.token, body: { title: `Student Council President ${run}`, description: 'Annual election' },
  })).data;
  ok('Election created by the administrator', election.status === 'DRAFT', `election ${election.id}`);
  const now = Date.now();
  const rules = {
    maxSelections: 1, countingMethod: 'PLURALITY', requireCandidateApproval: true, anonymousVoting: true,
    publicResults: true, qrReceipts: true, receiptsRequired: true, notaEnabled: true, candidatesMayVote: true,
    administratorsMayVote: false, resultPublicationPolicy: 'MANUAL', minCandidates: 3,
    campaignStart: new Date(now - 60_000).toISOString(), campaignEnd: new Date(now).toISOString(),
    votingStart: new Date(now).toISOString(), votingEnd: new Date(now + 86_400_000).toISOString(),
    withdrawalDeadline: new Date(now).toISOString(),
  };
  const bad = await api('PUT', `/api/elections/${election.id}/rules`, {
    token: admin.token, body: { ...rules, maxSelections: 2 }, expect: [422],
  });
  ok('Invalid rule combination rejected by the rule engine', bad.data.code === 'INVALID_RULES', bad.data.message);
  await api('PUT', `/api/elections/${election.id}/rules`, { token: admin.token, body: rules });
  ok('Election rules configured', true);

  await api('POST', `/api/elections/${election.id}/voters/add-all-members`, { token: admin.token });
  await api('POST', `/api/elections/${election.id}/transitions`, { token: admin.token, body: { target: 'REGISTRATION' } });
  const skip = await api('POST', `/api/elections/${election.id}/transitions`, {
    token: admin.token, body: { target: 'VOTING' }, expect: [409],
  });
  ok('Invalid state transition rejected', skip.data.code === 'INVALID_TRANSITION');

  // Candidates
  const apps = [];
  for (const [i, c] of cands.entries()) {
    const name = Object.keys(accounts).find((k) => accounts[k].email === c.email);
    apps.push((await api('POST', `/api/elections/${election.id}/applications`, {
      token: c.token, body: { displayName: name.replace(' Candidate', ''), statement: `Vision statement ${i + 1}`,
        qualifications: 'B.Tech, class representative', achievements: 'Hackathon winner' },
    })).data);
  }
  ok('Three candidates registered', apps.length === 3);
  for (const app of apps) {
    await api('POST', `/api/applications/${app.id}/review`, { token: admin.token, body: { decision: 'APPROVE' } });
  }
  const candidates = (await api('GET', `/api/elections/${election.id}/candidates`, { token: admin.token })).data;
  ok('Candidate applications approved', candidates.length === 3 && candidates.every((c) => c.status === 'ACTIVE'));

  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082', 'hex');
  for (const [i, c] of cands.entries()) {
    await api('PUT', `/api/candidates/${candidates[i].id}/manifesto`, {
      token: c.token, body: { vision: 'A better campus', mission: 'Transparent council', goals: 'Wi-Fi everywhere',
        schemes: 'Weekly open forums' },
    });
    await api('POST', `/api/candidates/${candidates[i].id}/manifesto/publish`, { token: c.token });
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'photo.png');
    await api('POST', `/api/candidates/${candidates[i].id}/media?type=PHOTO`, { token: c.token, form });
  }
  const evil = new FormData();
  evil.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png');
  const rejectedUpload = await api('POST', `/api/candidates/${candidates[0].id}/media?type=PHOTO`, {
    token: cands[0].token, form: evil, expect: [400],
  });
  ok('Profiles and manifestos published; malicious upload rejected', rejectedUpload.data.code === 'UNSUPPORTED_MEDIA');

  await api('POST', `/api/elections/${election.id}/transitions`, { token: admin.token, body: { target: 'CAMPAIGN' } });
  await api('POST', `/api/elections/${election.id}/transitions`, { token: admin.token, body: { target: 'VOTING' } });
  ok('Voting opened', true);
  if (PREPARE) {
    printAccounts(orgId, election.id);
    return;
  }

  const frozen = await api('PUT', `/api/candidates/${candidates[0].id}/manifesto`, {
    token: cands[0].token, body: { vision: 'changed' }, expect: [422],
  });
  ok('Manifestos are frozen once voting opens', frozen.data.code === 'MANIFESTO_FROZEN');

  // Voting
  const elig = (await api('GET', `/api/elections/${election.id}/eligibility`, { token: voter1.token })).data;
  ok('Voter logged in and is eligible', elig.mayVote && elig.votingOpen);
  const adminElig = (await api('GET', `/api/elections/${election.id}/eligibility`, { token: admin.token })).data;
  ok('Administrator of the election cannot vote', !adminElig.mayVote);
  const ballot = (await api('GET', `/api/elections/${election.id}/ballot`, { token: voter1.token })).data;
  ok('Ballot opened', ballot.options.length === 4, ballot.options.map((o) => o.label).join(', '));

  const v1 = await castVote(voter1, election.id, 0);
  ok('Vote confirmed and accepted with a blind-signed credential (key matches published fingerprint)',
    v1.valid && ['ACCEPTED_PENDING_PUBLICATION', 'BALLOT_RECORDED'].includes(v1.receipt.status));
  ok('Verification receipt and QR code received', !!v1.receipt.receiptCode && v1.receipt.qrPngDataUri?.startsWith('data:image/png'),
    v1.receipt.receiptCode);

  const dup = await api('POST', `/api/public/elections/${election.id}/ballots`, {
    body: { tokenHex: v1.prepared.tokenHex, signatureHex: v1.signatureHex, selections: [1], submissionNonce: randomNonceHex() },
    expect: [409],
  });
  ok('Duplicate vote with the same credential rejected', dup.data.code === 'DUPLICATE_VOTE');
  const second = await api('POST', `/api/elections/${election.id}/credentials`, {
    token: voter1.token, body: { blindedMessageHex: (await prepareCredential(
      (await api('GET', `/api/elections/${election.id}/credential-key`, { token: voter1.token })).data)).blindedMessageHex },
    expect: [409],
  });
  ok('Second credential for the same voter refused', second.data.code === 'CREDENTIAL_ALREADY_ISSUED');
  const replay = await api('POST', `/api/public/elections/${election.id}/ballots`, {
    body: { tokenHex: v1.prepared.tokenHex, signatureHex: v1.signatureHex, selections: [0], submissionNonce: v1.nonce },
  });
  ok('Safe retry returns the original receipt without a new ballot',
    replay.data.replayed && replay.data.receiptCode === v1.receipt.receiptCode);

  await castVote(voter2, election.id, 0);
  await castVote(cands[1], election.id, 1);

  const check1 = (await api('GET', `/api/public/receipts/${encodeURIComponent(v1.receipt.receiptCode)}`)).data;
  ok('Receipt verified (accepted, awaiting shuffled publication)', check1.status === 'RECEIPT_RECOGNIZED', check1.meaning);
  const invalid = (await api('GET', '/api/public/receipts/ABCDE-FGHJK-MNPQR-STVWX-Y')).data;
  ok('Invalid receipt detected', ['INVALID_RECEIPT', 'RECEIPT_NOT_FOUND'].includes(invalid.status), invalid.status);
  const board = (await api('GET', `/api/public/elections/${election.id}/bulletin`)).data;
  ok('Public bulletin board withholds ballots until a shuffled batch (3 waiting, batch size 10)',
    board.chain.valid && board.entries.totalElements === 0);

  await api('POST', `/api/elections/${election.id}/transitions`, { token: admin.token, body: { target: 'VERIFICATION' } });
  const closedBoard = (await api('GET', `/api/public/elections/${election.id}/bulletin`)).data;
  ok('Voting closed; final shuffled batch published to the hash-chained bulletin board',
    closedBoard.chain.valid && closedBoard.entries.totalElements === 3);
  const r1 = (await api('POST', `/api/elections/${election.id}/results/generate`, { token: admin.token })).data;
  const r2 = (await api('POST', `/api/elections/${election.id}/results/generate`, { token: admin.token })).data;
  ok('Results generated (repeatable, identical hash)', r1.resultHash === r2.resultHash && r2.generationCount === 2,
    r1.items.map((i) => `${i.label}:${i.votes}`).join(', '));
  await api('POST', `/api/elections/${election.id}/transitions`, { token: admin.token, body: { target: 'PUBLISHED' } });
  const pub = (await api('GET', `/api/public/elections/${election.id}/results`)).data;
  ok('Results published', pub.status === 'PUBLISHED', pub.explanation);
  const regen = await api('POST', `/api/elections/${election.id}/results/generate`, { token: admin.token, expect: [409] });
  ok('Published results cannot be regenerated', ['RESULTS_PUBLISHED', 'OPERATION_NOT_ALLOWED_IN_STATE'].includes(regen.data.code));
  const check2 = (await api('GET', `/api/public/receipts/${encodeURIComponent(v1.receipt.receiptCode)}`)).data;
  ok('Receipt now shows inclusion in the tally', check2.status === 'INCLUDED_IN_TALLY');

  const chain = (await api('POST', `/api/orgs/${orgId}/audit-logs/verify`, { token: auditor.token })).data;
  ok('Audit hash chain verified', chain.valid, `${chain.recordsChecked} records`);
  const denied = await api('POST', `/api/elections/${election.id}/transitions`, {
    token: auditor.token, body: { target: 'ARCHIVED' }, expect: [403],
  });
  ok('Auditor is read-only (archive refused)', denied.status === 403);
  const agg = (await api('GET', `/api/elections/${election.id}/integrity/aggregation`, { token: auditor.token })).data;
  ok('Auditor dashboard: aggregation recomputed', agg.valid, `${agg.ballotsChecked} ballots`);
  const er = (await api('POST', `/api/elections/${election.id}/reports?type=ELECTION`, { token: auditor.token })).data;
  const ar = (await api('POST', `/api/elections/${election.id}/reports?type=AUDIT`, { token: auditor.token })).data;
  ok('Election and audit reports generated', !!er.contentHash && !!ar.contentHash);
  await api('POST', `/api/elections/${election.id}/transitions`, { token: owner.token, body: { target: 'ARCHIVED' } });
  ok('Election archived', true);
  const trust = (await api('GET', `/api/elections/${election.id}/trust`, { token: owner.token })).data;
  ok('Election Trust Dashboard', trust.overall === 'ALL_CHECKS_PASSED',
    trust.checks.map((c) => `${c.key}=${c.status}`).join(', '));

  printAccounts(orgId, election.id);
}

function printAccounts(orgId, electionId) {
  console.log(`\nAll ${step} steps passed. Organization id ${orgId}, election id ${electionId}.`);
  console.log('Demo accounts created for this run (passwords generated at random; keep them private):');
  for (const [name, a] of Object.entries(accounts)) console.log(`  ${a.role.padEnd(15)} ${name.padEnd(16)} ${a.email}  ${a.password}`);
}

main().catch((err) => {
  console.error('\nE2E workflow FAILED:', err.message);
  process.exit(1);
}).then(() => process.exit(failures ? 1 : 0));
