#!/usr/bin/env node
// DIGI-VOTE Firebase Authentication end-to-end test against the Firebase Auth EMULATOR.
//
// Prerequisites (see docs/DEPLOYMENT.md, "Testing Firebase sign-in with the emulator"):
//   npx firebase-tools emulators:start --only auth --project digi-vote-be516
//   backend started with FIREBASE_ENABLED=true and FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
//
//   node frontend/scripts/firebase-auth-e2e.mjs [backendUrl]     (default http://localhost:8081)
//
// Uses the real Firebase JS SDK (browser code path) and the real Admin SDK verification in the backend;
// only the identity provider is emulated. Never point this at a production backend.
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, applyActionCode, confirmPasswordReset, connectAuthEmulator, createUserWithEmailAndPassword,
  getAuth, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signOut,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { randomBytes } from 'node:crypto';

const PROJECT = 'digi-vote-be516';
const EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const API = (process.argv[2] || 'http://localhost:8081').replace(/\/$/, '');
const run = randomBytes(3).toString('hex');
const pw = () => `Fb${randomBytes(8).toString('base64url')}9`;

const app = initializeApp({ apiKey: 'emulator-api-key', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT }, `e2e-${run}`);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${EMULATOR}`, { disableWarnings: true });

let step = 0;
let failed = 0;
function check(label, ok, detail = '') {
  step += 1;
  if (!ok) failed += 1;
  console.log(`${String(step).padStart(2, '0')}. [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function oobCode(email, type) {
  const res = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes } = await res.json();
  return oobCodes.filter((c) => c.email === email && c.requestType === type).at(-1)?.oobCode;
}

async function expectAuthError(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return e.code;
  }
}

function forgeExpired(token) {
  const [h, p] = token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  payload.iat -= 7200;
  payload.auth_time -= 7200;
  payload.exp = payload.iat + 3600;
  return `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
}

async function main() {
  console.log(`Firebase Auth emulator ${EMULATOR}, backend ${API}, run ${run}\n`);

  // --- Email/Password registration with verification -------------------------------------------
  const ownerEmail = `owner.${run}@fb-e2e.digivote.test`;
  let ownerPw = pw();
  const created = await createUserWithEmailAndPassword(auth, ownerEmail, ownerPw);
  await sendEmailVerification(created.user);
  const unverified = await created.user.getIdToken();
  const r1 = await api('POST', '/api/auth/firebase/register-organization',
    { idToken: unverified, organizationName: `FB Org ${run}`, fullName: 'Owner Fb' });
  check('Unverified email cannot register an organization', r1.status === 403 && r1.body.code === 'EMAIL_NOT_VERIFIED');
  const r1b = await api('POST', '/api/auth/firebase', { idToken: unverified });
  check('Unverified email cannot sign in', r1b.body.code === 'EMAIL_NOT_VERIFIED');

  check('Invalid verification link is rejected', await expectAuthError(applyActionCode(auth, 'not-a-real-code')) === 'auth/invalid-action-code');
  const verifyCode = await oobCode(ownerEmail, 'VERIFY_EMAIL');
  await applyActionCode(auth, verifyCode);
  await auth.currentUser.reload();
  check('Verification link verifies the email', auth.currentUser.emailVerified === true);
  check('A used verification link cannot be reused', await expectAuthError(applyActionCode(auth, verifyCode)) === 'auth/invalid-action-code');

  const reg = await api('POST', '/api/auth/firebase/register-organization',
    { idToken: await auth.currentUser.getIdToken(true), organizationName: `FB Org ${run}`, fullName: 'Owner Fb' });
  check('Verified Firebase user registers an organization', reg.status === 201 && reg.body.user.memberships[0].role === 'ORG_OWNER'
    && reg.body.user.localPassword === false);
  const orgId = reg.body.user.memberships[0].organizationId;
  const owner = reg.body.token;
  const again = await api('POST', '/api/auth/firebase/register-organization',
    { idToken: await auth.currentUser.getIdToken(true), organizationName: 'Dup', fullName: 'Owner Fb' });
  check('Second registration with the same identity is refused', again.status === 409 && again.body.code === 'EMAIL_IN_USE');

  // --- Email/Password sign-in, wrong password, duplicates ---------------------------------------
  await signOut(auth);
  const wrong = await expectAuthError(signInWithEmailAndPassword(auth, ownerEmail, 'Wrong-password-1'));
  check('Wrong password is rejected by Firebase', ['auth/invalid-credential', 'auth/wrong-password'].includes(wrong), wrong);
  const dup = await expectAuthError(createUserWithEmailAndPassword(auth, ownerEmail, pw()));
  check('Duplicate Firebase account is rejected', dup === 'auth/email-already-in-use', dup);
  const signedIn = await signInWithEmailAndPassword(auth, ownerEmail, ownerPw);
  const login = await api('POST', '/api/auth/firebase', { idToken: await signedIn.user.getIdToken() });
  check('Email/Password sign-in exchanges for a DIGI-VOTE session', login.status === 200 && login.body.user.email === ownerEmail);
  const passwordLogin = await api('POST', '/api/auth/login', { email: ownerEmail, password: ownerPw });
  check('No DIGI-VOTE password exists for Firebase-only accounts', passwordLogin.status === 401);

  // --- Password recovery -------------------------------------------------------------------------
  await sendPasswordResetEmail(auth, ownerEmail);
  const resetCode = await oobCode(ownerEmail, 'PASSWORD_RESET');
  check('Password reset link identifies the account', await verifyPasswordResetCode(auth, resetCode) === ownerEmail);
  const newPw = pw();
  await confirmPasswordReset(auth, resetCode, newPw);
  check('Old password stops working after reset',
    ['auth/invalid-credential', 'auth/wrong-password'].includes(await expectAuthError(signInWithEmailAndPassword(auth, ownerEmail, ownerPw))));
  ownerPw = newPw;
  const afterReset = await signInWithEmailAndPassword(auth, ownerEmail, ownerPw);
  check('New password signs in', afterReset.user.email === ownerEmail);
  check('Used reset link cannot be reused', await expectAuthError(confirmPasswordReset(auth, resetCode, pw())) === 'auth/invalid-action-code');

  // --- Token checks: invalid, expired, revoked ---------------------------------------------------
  const goodToken = await afterReset.user.getIdToken(true);
  const garbage = await api('POST', '/api/auth/firebase', { idToken: 'not.a.token' });
  check('Malformed token is rejected', garbage.status === 401 && garbage.body.code === 'FIREBASE_TOKEN_INVALID');
  const expired = await api('POST', '/api/auth/firebase', { idToken: forgeExpired(goodToken) });
  check('Expired token is rejected', expired.status === 401 && expired.body.code === 'FIREBASE_TOKEN_EXPIRED', expired.body?.code);
  await fetch(`http://${EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: afterReset.user.uid, validSince: String(Math.floor(Date.now() / 1000) + 1) }),
  });
  await new Promise((r) => setTimeout(r, 2000));
  const revoked = await api('POST', '/api/auth/firebase', { idToken: goodToken });
  check('Revoked session token is rejected', revoked.status === 401 && revoked.body.code === 'FIREBASE_TOKEN_REVOKED', revoked.body?.code);

  // --- Google sign-in + invitation acceptance ----------------------------------------------------
  const voterEmail = `voter.${run}@fb-e2e.digivote.test`;
  const invite = await api('POST', `/api/orgs/${orgId}/members`, { email: voterEmail, fullName: 'Voter Google', role: 'VOTER' }, owner);
  const google = await signInWithCredential(auth, GoogleAuthProvider.credential(
    JSON.stringify({ sub: `g-${run}`, email: voterEmail, email_verified: true, name: 'Voter Google' })));
  const gToken = await google.user.getIdToken();
  const early = await api('POST', '/api/auth/firebase', { idToken: gToken });
  check('Google sign-in cannot bypass a pending invitation', early.status === 403 && early.body.code === 'ACTIVATION_REQUIRED');
  const wrongCode = await api('POST', '/api/auth/firebase/activate', { idToken: gToken, activationCode: 'AAAA-BBBB-CCCC', fullName: 'Voter Google' });
  check('Wrong activation code is refused', wrongCode.status === 400 && wrongCode.body.code === 'INVALID_ACTIVATION');
  const activated = await api('POST', '/api/auth/firebase/activate',
    { idToken: gToken, activationCode: invite.body.activationCode, fullName: 'Voter Google', role: 'ORG_OWNER' });
  check('Google user accepts the invitation; role comes from the invitation only',
    activated.status === 200 && activated.body.user.memberships[0].role === 'VOTER');
  const googleLogin = await api('POST', '/api/auth/firebase', { idToken: await google.user.getIdToken(true) });
  check('Google sign-in works after activation', googleLogin.status === 200 && googleLogin.body.user.email === voterEmail);
  const escalate = await api('POST', `/api/orgs/${orgId}/elections`, { title: 'x' }, googleLogin.body.token);
  check('Firebase sign-in grants no extra privileges (voter cannot create elections)', escalate.status === 403);

  // --- Linking an existing DIGI-VOTE password account by verified Google email -------------------
  const adminEmail = `admin.${run}@fb-e2e.digivote.test`;
  const adminInvite = await api('POST', `/api/orgs/${orgId}/members`, { email: adminEmail, fullName: 'Admin Pw', role: 'ELECTION_ADMIN' }, owner);
  const adminPw = pw();
  await api('POST', '/api/auth/activate', { email: adminEmail, activationCode: adminInvite.body.activationCode, fullName: 'Admin Pw', password: adminPw });
  await signOut(auth);
  const unverifiedGoogle = await signInWithCredential(auth, GoogleAuthProvider.credential(
    JSON.stringify({ sub: `g2-${run}`, email: adminEmail, email_verified: false })));
  const noLink = await api('POST', '/api/auth/firebase', { idToken: await unverifiedGoogle.user.getIdToken() });
  check('Unverified Google email is not linked to an existing account', noLink.body.code === 'EMAIL_NOT_VERIFIED', noLink.body?.code);
  await signOut(auth);
  const verifiedGoogle = await signInWithCredential(auth, GoogleAuthProvider.credential(
    JSON.stringify({ sub: `g3-${run}`, email: adminEmail, email_verified: true })));
  const linked = await api('POST', '/api/auth/firebase', { idToken: await verifiedGoogle.user.getIdToken(true) });
  check('Verified Google email links the existing password account (same account, same role)',
    linked.status === 200 && linked.body.user.memberships[0].role === 'ELECTION_ADMIN' && linked.body.user.localPassword === true);

  const noAccount = await signInWithCredential(auth, GoogleAuthProvider.credential(
    JSON.stringify({ sub: `g4-${run}`, email: `stranger.${run}@fb-e2e.digivote.test`, email_verified: true })));
  const stranger = await api('POST', '/api/auth/firebase', { idToken: await noAccount.user.getIdToken() });
  check('Google user without a DIGI-VOTE account gets no access', stranger.status === 404 && stranger.body.code === 'NO_ACCOUNT');

  console.log(`\n${step - failed} of ${step} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('Firebase e2e FAILED:', e.code || '', e.message);
  process.exit(1);
});
