#!/usr/bin/env node
// DIGI-VOTE demo accounts: one account per role, authenticated through the FIREBASE AUTH EMULATOR.
//
//   node frontend/scripts/demo-accounts.mjs [--api URL] [--emulator HOST:PORT] [--open-voting]
//                                           [--reset-passwords] [--credentials FILE] [--verify-lifecycle]
//
// Normally run through scripts/demo-setup.sh (demo stack) or scripts/demo-check.sh (throwaway self-check).
//
// Safety:
//  * Only talks to a Firebase Auth emulator on localhost/127.0.0.1; it can never create live Firebase users.
//  * Requires a DIGI-VOTE backend that verifies emulator tokens (it refuses to continue otherwise).
//  * Roles are assigned only through DIGI-VOTE's own APIs: the owner registers the organization and invites
//    each person with an explicit role; an email address alone never grants anything.
//  * Email verification is not bypassed: the script requests the verification email from the emulator and
//    applies the emulator's out-of-band code, exactly what clicking the link does.
//  * Passwords are random per account, printed once, and stored only in a git-ignored, owner-only file so
//    re-runs can sign in again. Nothing is reset or deleted unless --reset-passwords is given (emulator only).
import { initializeApp } from 'firebase/app';
import {
  applyActionCode, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, sendEmailVerification,
  signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCredential, randomNonceHex, unblind, verifyCredential } from '../src/crypto/blindRsa.js';
import { verifyElectionCredentialKey } from '../src/crypto/keyTransparency.js';

const PROJECT = 'digi-vote-be516';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);

const API = opt('--api', 'http://localhost:8082').replace(/\/$/, '');
const EMULATOR = opt('--emulator', '127.0.0.1:9099');
const CRED_FILE = resolve(opt('--credentials', `${ROOT}/.local/demo/demo-credentials.json`));
const ORG_NAME = 'DIGI-VOTE Demo University';
const ELECTION_TITLE = 'Student Council President (Demo)';

/** Proposed role labels mapped to DIGI-VOTE's internal role codes (organization/RoleCode.java). */
const ACCOUNTS = [
  { key: 'owner', email: 'owner@digivote.test', name: 'Olivia Owner (Demo)', role: 'ORG_OWNER', label: 'ORGANIZATION_OWNER' },
  { key: 'admin', email: 'admin@digivote.test', name: 'Arjun Admin (Demo)', role: 'ELECTION_ADMIN', label: 'ELECTION_ADMINISTRATOR' },
  { key: 'candidate', email: 'candidate@digivote.test', name: 'Priya Candidate (Demo)', role: 'CANDIDATE', label: 'CANDIDATE' },
  { key: 'voter', email: 'voter@digivote.test', name: 'Vikram Voter (Demo)', role: 'VOTER', label: 'VOTER' },
  { key: 'auditor', email: 'auditor@digivote.test', name: 'Anita Auditor (Demo)', role: 'AUDITOR', label: 'AUDITOR' },
];

let failures = 0;
const log = (msg) => console.log(msg);
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
  return ok;
}
function fail(msg) {
  console.error(`\nSETUP STOPPED: ${msg}`);
  process.exit(2);
}

async function api(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, body: data };
}
async function ok(method, path, body, token) {
  const r = await api(method, path, body, token);
  if (r.status < 200 || r.status > 299) fail(`${method} ${path} -> ${r.status} ${r.body?.code ?? ''} ${r.body?.message ?? ''}`);
  return r.body;
}

// ------------------------------------------------------------------ safety checks

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR)) fail(`--emulator must be a local Firebase Auth emulator, got "${EMULATOR}".`);
if (flag('--verify-lifecycle') && API === 'http://localhost:8082') {
  fail('--verify-lifecycle consumes the demo election; run it only through scripts/demo-check.sh (isolated copy).');
}

async function emulatorRest(path, body) {
  const res = await fetch(`http://${EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify(body),
  });
  return res.json();
}

async function preflight() {
  const emu = await fetch(`http://${EMULATOR}/`).then((r) => r.json()).catch(() => null);
  if (!emu?.authEmulator?.ready) fail(`No Firebase Auth emulator at ${EMULATOR}. Start the demo stack first (scripts/demo-start.sh).`);
  const cfg = await api('GET', '/api/auth/config').catch(() => null);
  if (!cfg || cfg.status !== 200) fail(`DIGI-VOTE backend not reachable at ${API}.`);
  if (!cfg.body.firebaseEnabled) fail(`Backend at ${API} does not have Firebase enabled.`);
}

// ------------------------------------------------------------------ Firebase (emulator) accounts

const app = initializeApp({ apiKey: 'emulator-only', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT }, 'demo');
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${EMULATOR}`, { disableWarnings: true });

function newPassword() {
  return `Dv${randomBytes(12).toString('base64url')}7k`;
}

function loadCredentials() {
  if (!existsSync(CRED_FILE)) return {};
  return JSON.parse(readFileSync(CRED_FILE, 'utf8'));
}
function saveCredentials(creds) {
  mkdirSync(dirname(CRED_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
  chmodSync(CRED_FILE, 0o600);
}

async function oobCode(email) {
  const res = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/oobCodes`).then((r) => r.json());
  return res.oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').at(-1)?.oobCode;
}

/** Ensures the emulator user exists with a known password and a verified email; returns a fresh ID token. */
async function ensureFirebaseUser(account, creds, created) {
  const lookup = await emulatorRest('accounts:lookup', { email: [account.email] });
  const existing = lookup.users?.[0];
  if (!existing) {
    const password = newPassword();
    await createUserWithEmailAndPassword(auth, account.email, password);
    creds[account.key] = { email: account.email, password };
    created.push(account);
  } else if (flag('--reset-passwords') || !creds[account.key]?.password) {
    if (!flag('--reset-passwords')) {
      fail(`${account.email} exists in the emulator but its password is not in ${CRED_FILE}. Re-run with --reset-passwords.`);
    }
    const password = newPassword();
    await emulatorRest('accounts:update', { localId: existing.localId, password });
    creds[account.key] = { email: account.email, password };
    created.push(account);
  }
  const { user } = await signInWithEmailAndPassword(auth, account.email, creds[account.key].password);
  if (!user.emailVerified) {
    // Same steps as a person clicking the link in the verification email.
    await sendEmailVerification(user);
    await applyActionCode(auth, await oobCode(account.email));
    await user.reload();
  }
  if (!user.emailVerified) fail(`Could not verify ${account.email} in the emulator.`);
  const token = await user.getIdToken(true);
  await signOut(auth);
  return token;
}

// ------------------------------------------------------------------ DIGI-VOTE accounts and roles

async function setupAccounts(creds, created) {
  const sessions = {};
  const owner = ACCOUNTS[0];
  const ownerToken = await ensureFirebaseUser(owner, creds, created);
  let res = await api('POST', '/api/auth/firebase', { idToken: ownerToken });
  if (res.status === 404 && res.body?.code === 'NO_ACCOUNT') {
    res = await api('POST', '/api/auth/firebase/register-organization', {
      idToken: ownerToken, organizationName: ORG_NAME, fullName: owner.name,
      organizationDescription: 'Demonstration organization for the DIGI-VOTE capstone (test data only).',
    });
    if (res.status !== 201) fail(`Owner registration failed: ${res.body?.code} ${res.body?.message}`);
    log(`  created organization "${ORG_NAME}" with ${owner.email} as Organization Owner`);
  } else if (res.status !== 200) {
    fail(`Owner sign-in failed: ${res.body?.code} ${res.body?.message}`);
  }
  const ownerMembership = res.body.user.memberships.find((m) => m.role === 'ORG_OWNER' && m.organizationName === ORG_NAME);
  if (!ownerMembership) fail(`${owner.email} is not the owner of "${ORG_NAME}" in this database; refusing to change roles.`);
  const orgId = ownerMembership.organizationId;
  sessions.owner = res.body.token;

  const members = (await ok('GET', `/api/orgs/${orgId}/members?size=100`, undefined, sessions.owner)).content;
  for (const account of ACCOUNTS.slice(1)) {
    const idToken = await ensureFirebaseUser(account, creds, created);
    const member = members.find((m) => m.email === account.email);
    if (!member) {
      // The owner invites with an explicit role; the invitee proves the invited mailbox and the one-time code.
      const invite = await ok('POST', `/api/orgs/${orgId}/members`, { email: account.email, fullName: account.name, role: account.role }, sessions.owner);
      const act = await api('POST', '/api/auth/firebase/activate', { idToken, activationCode: invite.activationCode, fullName: account.name });
      if (act.status !== 200) fail(`Activation of ${account.email} failed: ${act.body?.code} ${act.body?.message}`);
      sessions[account.key] = act.body.token;
      log(`  invited and activated ${account.email} as ${account.role}`);
    } else {
      if (member.role !== account.role) {
        fail(`${account.email} already has role ${member.role} in "${ORG_NAME}" (expected ${account.role}); not changing it.`);
      }
      if (member.status !== 'ACTIVE') fail(`${account.email} membership is ${member.status}; resolve it in the Members page.`);
      const login = await api('POST', '/api/auth/firebase', { idToken });
      if (login.status !== 200) fail(`Sign-in of ${account.email} failed: ${login.body?.code} ${login.body?.message}`);
      sessions[account.key] = login.body.token;
    }
  }
  return { orgId, sessions };
}

// ------------------------------------------------------------------ minimal demo election

async function setupElection(orgId, s) {
  const elections = (await ok('GET', `/api/orgs/${orgId}/elections?size=100`, undefined, s.admin)).content;
  let election = elections.find((e) => e.title === ELECTION_TITLE);
  if (election) {
    log(`  demo election already exists (status ${election.status}); leaving it unchanged`);
  } else {
    election = await ok('POST', `/api/orgs/${orgId}/elections`, {
      title: ELECTION_TITLE, description: 'Demo election with one candidate and None Of The Above.',
    }, s.admin);
    const now = Date.now();
    await ok('PUT', `/api/elections/${election.id}/rules`, {
      maxSelections: 1, countingMethod: 'PLURALITY', requireCandidateApproval: true, anonymousVoting: true,
      publicResults: true, qrReceipts: true, receiptsRequired: true, notaEnabled: true, candidatesMayVote: true,
      administratorsMayVote: false, resultPublicationPolicy: 'MANUAL', minCandidates: 1,
      campaignStart: new Date(now - 60_000).toISOString(), campaignEnd: new Date(now).toISOString(),
      votingStart: new Date(now).toISOString(), votingEnd: new Date(now + 14 * 86_400_000).toISOString(),
      withdrawalDeadline: new Date(now).toISOString(),
    }, s.admin);
    await ok('POST', `/api/elections/${election.id}/voters`, { emails: ['voter@digivote.test', 'candidate@digivote.test'] }, s.admin);
    await ok('POST', `/api/elections/${election.id}/transitions`, { target: 'REGISTRATION', note: 'Demo setup' }, s.admin);
    const application = await ok('POST', `/api/elections/${election.id}/applications`, {
      displayName: 'Priya Sharma', statement: 'Open council meetings and a transparent budget.',
      qualifications: 'B.Tech (CSE), class representative', achievements: 'Organized the 2026 campus hackathon',
    }, s.candidate);
    const reviewed = await ok('POST', `/api/applications/${application.id}/review`, { decision: 'APPROVE' }, s.admin);
    await ok('PUT', `/api/candidates/${reviewed.candidateId}/manifesto`, {
      vision: 'A student council every student can trust.', mission: 'Publish every decision and budget line.',
      goals: 'Campus-wide Wi-Fi; weekly open forums.', schemes: 'Monthly town halls; online grievance tracker.',
    }, s.candidate);
    await ok('POST', `/api/candidates/${reviewed.candidateId}/manifesto/publish`, undefined, s.candidate);
    await ok('POST', `/api/elections/${election.id}/transitions`, { target: 'CAMPAIGN', note: 'Demo setup' }, s.admin);
    election = await ok('GET', `/api/elections/${election.id}`, undefined, s.admin);
    log(`  created "${ELECTION_TITLE}": voter list (voter + candidate), approved candidate with published manifesto, state CAMPAIGN`);
  }
  if (flag('--open-voting') && election.status === 'CAMPAIGN') {
    await ok('POST', `/api/elections/${election.id}/transitions`, { target: 'VOTING', note: 'Demo setup' }, s.admin);
    election = await ok('GET', `/api/elections/${election.id}`, undefined, s.admin);
    log('  opened voting');
  }
  return election;
}

// ------------------------------------------------------------------ verification

async function verifyRoles(orgId, electionId, s) {
  log('\nRole and permission checks');
  for (const a of ACCOUNTS) {
    const me = await api('GET', '/api/auth/me', undefined, s[a.key]);
    const m = me.body?.memberships?.find((x) => x.organizationId === orgId);
    check(`${a.email} signs in and holds ${a.label} (${a.role})`, me.status === 200 && m?.role === a.role, m?.role);
  }
  const st = async (method, path, token, body) => (await api(method, path, body, token)).status;
  const e = `/api/elections/${electionId}`;
  check('Owner: organization overview allowed', await st('GET', `/api/orgs/${orgId}/overview`, s.owner) === 200);
  check('Owner: member directory allowed', await st('GET', `/api/orgs/${orgId}/members`, s.owner) === 200);
  check('Owner: may not vote in an election they administer', (await api('GET', `${e}/eligibility`, undefined, s.owner)).body?.mayVote === false);
  check('Admin: readiness and voter list allowed', await st('GET', `${e}/readiness`, s.admin) === 200 && await st('GET', `${e}/voters`, s.admin) === 200);
  check('Admin: inviting organization members forbidden', await st('POST', `/api/orgs/${orgId}/members`, s.admin,
    { email: 'x@digivote.test', fullName: 'X', role: 'VOTER' }) === 403);
  check('Admin: organization settings forbidden', await st('PUT', `/api/orgs/${orgId}`, s.admin, { name: 'x', primaryColor: '#000000' }) === 403);
  check('Candidate: own applications allowed', await st('GET', '/api/me/applications', s.candidate) === 200);
  check('Candidate: election transitions forbidden', await st('POST', `${e}/transitions`, s.candidate, { target: 'VOTING' }) === 403);
  check('Candidate: voter list forbidden', await st('GET', `${e}/voters`, s.candidate) === 403);
  check('Candidate: audit log forbidden', await st('GET', `/api/orgs/${orgId}/audit-logs`, s.candidate) === 403);
  check('Voter: eligible to vote', (await api('GET', `${e}/eligibility`, undefined, s.voter)).body?.eligible === true);
  check('Voter: creating elections forbidden', await st('POST', `/api/orgs/${orgId}/elections`, s.voter, { title: 'x' }) === 403);
  check('Voter: applications and audit log forbidden', await st('GET', `${e}/applications`, s.voter) === 403
    && await st('GET', `/api/orgs/${orgId}/audit-logs`, s.voter) === 403);
  check('Auditor: audit log and readiness allowed (read-only)', await st('GET', `/api/orgs/${orgId}/audit-logs`, s.auditor) === 200
    && await st('GET', `${e}/readiness`, s.auditor) === 200);
  check('Auditor: transitions, rule changes and invitations forbidden',
    await st('POST', `${e}/transitions`, s.auditor, { target: 'VOTING' }) === 403
    && await st('PUT', `${e}/rules`, s.auditor, {}) !== 200
    && await st('POST', `/api/orgs/${orgId}/members`, s.auditor, { email: 'y@digivote.test', fullName: 'Y', role: 'VOTER' }) === 403);
  check('Auditor: may not vote', (await api('GET', `${e}/eligibility`, undefined, s.auditor)).body?.mayVote === false);
}

async function castVote(token, electionId, option) {
  const key = await ok('GET', `/api/elections/${electionId}/credential-key`, undefined, token);
  await verifyElectionCredentialKey(electionId, key, await ok('GET', `/api/public/elections/${electionId}/credential-key`), { pin: false });
  const prepared = await prepareCredential(key);
  const issued = await ok('POST', `/api/elections/${electionId}/credentials`, { blindedMessageHex: prepared.blindedMessageHex }, token);
  const signatureHex = unblind(issued.blindSignatureHex, prepared.blindingFactorHex, key);
  if (!(await verifyCredential(prepared.tokenHex, signatureHex, key))) fail('Credential did not verify');
  const cast = await api('POST', `/api/public/elections/${electionId}/ballots`,
    { tokenHex: prepared.tokenHex, signatureHex, selections: [option], submissionNonce: randomNonceHex() });
  return { cast, prepared, signatureHex };
}

async function verifyLifecycle(orgId, election, s) {
  log('\nFull lifecycle with the demo accounts (isolated copy)');
  const id = election.id;
  if (election.status === 'CAMPAIGN') await ok('POST', `/api/elections/${id}/transitions`, { target: 'VOTING' }, s.admin);
  const vote = await castVote(s.voter, id, 0);
  check('Voter casts an anonymous ballot and receives a receipt', vote.cast.status === 201 && !!vote.cast.body.receiptCode);
  check('Receipt contains no identity', !JSON.stringify(vote.cast.body).includes('@digivote.test'));
  const dup = await api('POST', `/api/public/elections/${id}/ballots`,
    { tokenHex: vote.prepared.tokenHex, signatureHex: vote.signatureHex, selections: [1], submissionNonce: randomNonceHex() });
  check('Duplicate vote is rejected', dup.status === 409 && dup.body.code === 'DUPLICATE_VOTE');
  const second = await api('POST', `/api/elections/${id}/credentials`, { blindedMessageHex: 'abcdef' }, s.voter);
  check('A second credential for the voter is refused', second.body?.code === 'CREDENTIAL_ALREADY_ISSUED');
  const candidateVote = await castVote(s.candidate, id, 1);
  check('Eligible candidate can vote (NOTA)', candidateVote.cast.status === 201);
  const rec = await api('GET', `/api/public/receipts/${encodeURIComponent(vote.cast.body.receiptCode)}`);
  check('Receipt recognized while its shuffled batch is pending', rec.body?.status === 'RECEIPT_RECOGNIZED');
  const auditorResults = await api('POST', `/api/elections/${id}/results/generate`, undefined, s.auditor);
  check('Auditor cannot generate results', auditorResults.status === 403);
  await ok('POST', `/api/elections/${id}/transitions`, { target: 'VERIFICATION' }, s.admin);
  const result = await ok('POST', `/api/elections/${id}/results/generate`, undefined, s.admin);
  check('Results counted from 2 accepted ballots', result.acceptedBallots === 2, result.explanation);
  check('Voter cannot publish results', (await api('POST', `/api/elections/${id}/transitions`, { target: 'PUBLISHED' }, s.voter)).status === 403);
  await ok('POST', `/api/elections/${id}/transitions`, { target: 'PUBLISHED' }, s.admin);
  check('Administrator publishes results', (await api('GET', `/api/public/elections/${id}/results`)).body?.status === 'PUBLISHED');
  const rec2 = await api('GET', `/api/public/receipts/${encodeURIComponent(vote.cast.body.receiptCode)}`);
  check('Receipt now shows INCLUDED_IN_TALLY', rec2.body?.status === 'INCLUDED_IN_TALLY');
  const chain = await api('POST', `/api/orgs/${orgId}/audit-logs/verify`, undefined, s.auditor);
  check('Auditor verifies the audit hash chain', chain.status === 200 && chain.body.valid === true, `${chain.body?.recordsChecked} records`);
  const agg = await api('GET', `/api/elections/${id}/integrity/aggregation`, undefined, s.auditor);
  check('Auditor recomputes the encrypted tally aggregation', agg.body?.valid === true);
  const rep = await api('POST', `/api/elections/${id}/reports?type=AUDIT`, undefined, s.auditor);
  check('Auditor generates an audit report', rep.status === 201);
  const bulletin = await api('GET', `/api/public/elections/${id}/bulletin`);
  check('Bulletin board exposes no identities', bulletin.status === 200 && !JSON.stringify(bulletin.body).includes('@digivote.test'));
  const perBallot = await api('GET', `/api/orgs/${orgId}/audit-logs?typePrefix=BALLOT_ACCEPTED`, undefined, s.auditor);
  const batches = await api('GET', `/api/orgs/${orgId}/audit-logs?typePrefix=BALLOTS_PUBLISHED`, undefined, s.auditor);
  check('No per-ballot audit events; only actor-less batch publications', perBallot.body?.content?.length === 0
    && batches.body?.content?.length > 0 && batches.body.content.every((l) => !l.actorRef));
  await ok('POST', `/api/elections/${id}/transitions`, { target: 'ARCHIVED' }, s.owner);
  const trust = await api('GET', `/api/elections/${id}/trust`, undefined, s.owner);
  check('Trust Dashboard shows no failed checks', trust.status === 200 && !trust.body.checks.some((c) => c.status === 'FAIL'), trust.body?.overall);
}

// ------------------------------------------------------------------ main

async function main() {
  log(`DIGI-VOTE demo accounts\n  backend  ${API}\n  emulator ${EMULATOR} (Firebase Auth emulator, project ${PROJECT}; no live Firebase users)\n`);
  await preflight();
  const creds = loadCredentials();
  const created = [];
  log('Accounts');
  const { orgId, sessions } = await setupAccounts(creds, created);
  if (created.length) saveCredentials(creds);
  log('\nDemo data');
  const election = await setupElection(orgId, sessions);

  await verifyRoles(orgId, election.id, sessions);
  if (flag('--verify-lifecycle')) await verifyLifecycle(orgId, election, sessions);

  log('\nDemo accounts (emulator-only)');
  for (const a of ACCOUNTS) {
    const fresh = created.includes(a);
    log(`  ${a.label.padEnd(23)} ${a.email.padEnd(24)} ${fresh ? `password: ${creds[a.key].password}` : '(password unchanged; see credentials file)'}`);
  }
  log(`\nPasswords are stored only in ${CRED_FILE} (git-ignored, owner-only).`);
  log(`Organization id ${orgId}; election "${ELECTION_TITLE}" (id ${election.id}).`);
  if (failures) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  log('\nAll checks passed.');
}

main().catch((e) => fail(e.code ? `${e.code} ${e.message}` : e.message));
