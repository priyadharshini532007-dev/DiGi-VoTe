/* DigiVote web/crypto.js
 * Voter-side cryptography for the web app: RSA-FDH blind signatures (so the server signs a credential without seeing
 * it) and credential-key transparency checks. Generated from frontend-react/src/crypto/blindRsa.js and
 * keyTransparency.js (the React app's tested, backend-compatible implementations); only the module syntax changed.
 * The browser must do this part itself: if the server blinded for the voter it could link voter and ballot.
 * Everything else (signing, encryption, tallying, receipts, hashing the audit chain) stays on the backend.
 */
(function () {
  'use strict';
// DIGI-VOTE voter-side RSA blind signature protocol (Chaum, RSA-FDH).
// Mirrors backend/src/main/java/com/digivote/crypto/BlindRsa.java. Runs in the browser (and Node 20+)
// using native BigInt and Web Crypto. The unblinded token and blinding factor never leave this device
// until the token is spent with the ballot.

const DOMAIN = new TextEncoder().encode('DIGI-VOTE-FDH-v1');

function hexToBigInt(hex) {
  return BigInt('0x' + hex);
}

function bigIntToHex(value) {
  return value.toString(16);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bitLength(n) {
  return n.toString(2).length;
}

function modPow(base, exp, mod) {
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function egcd(a, b) {
  let [oldR, r] = [a, b];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return { gcd: oldR, x: oldS };
}

function modInverse(a, n) {
  const { gcd, x } = egcd(((a % n) + n) % n, n);
  if (gcd !== 1n) throw new Error('Value is not invertible');
  return ((x % n) + n) % n;
}

async function sha256(bytes) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

async function mgf1(seed, length) {
  const out = new Uint8Array(length);
  let filled = 0;
  for (let counter = 0; filled < length; counter++) {
    const block = new Uint8Array(seed.length + 4);
    block.set(seed);
    new DataView(block.buffer).setUint32(seed.length, counter);
    const digest = await sha256(block);
    const take = Math.min(digest.length, length - filled);
    out.set(digest.subarray(0, take), filled);
    filled += take;
  }
  return out;
}

/** FDH(t) = MGF1-SHA256("DIGI-VOTE-FDH-v1" || t) reduced below 2^(bits-1). */
async function fullDomainHash(tokenBytes, n) {
  const bits = bitLength(n);
  const length = Math.ceil(bits / 8);
  const seed = new Uint8Array(DOMAIN.length + tokenBytes.length);
  seed.set(DOMAIN);
  seed.set(tokenBytes, DOMAIN.length);
  const h = hexToBigInt(bytesToHex(await mgf1(seed, length)));
  return h % (1n << BigInt(bits - 1));
}

function randomBigIntBelow(n) {
  const bytes = Math.ceil(bitLength(n) / 8);
  for (;;) {
    const buf = globalThis.crypto.getRandomValues(new Uint8Array(bytes));
    const v = hexToBigInt(bytesToHex(buf)) % n;
    if (v >= 2n && egcd(v, n).gcd === 1n) return v;
  }
}

/**
 * Step 1 (voter device): create a random token and blind its hash.
 * @param key {modulusHex, publicExponentHex}
 * @returns {{tokenHex: string, blindingFactorHex: string, blindedMessageHex: string}}
 */
async function prepareCredential(key) {
  const n = hexToBigInt(key.modulusHex);
  const e = hexToBigInt(key.publicExponentHex);
  const token = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const m = await fullDomainHash(token, n);
  const r = randomBigIntBelow(n);
  const blinded = (m * modPow(r, e, n)) % n;
  return { tokenHex: bytesToHex(token), blindingFactorHex: bigIntToHex(r), blindedMessageHex: bigIntToHex(blinded) };
}

/** Step 2 (voter device): remove the blinding factor from the server's signature. */
function unblind(blindSignatureHex, blindingFactorHex, key) {
  const n = hexToBigInt(key.modulusHex);
  const s = (hexToBigInt(blindSignatureHex) * modInverse(hexToBigInt(blindingFactorHex), n)) % n;
  return bigIntToHex(s);
}

/** Checks s^e mod n == FDH(token) before the credential is used. */
async function verifyCredential(tokenHex, signatureHex, key) {
  const n = hexToBigInt(key.modulusHex);
  const e = hexToBigInt(key.publicExponentHex);
  return modPow(hexToBigInt(signatureHex), e, n) === (await fullDomainHash(hexToBytes(tokenHex), n));
}

function randomNonceHex() {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

// DIGI-VOTE credential-key transparency (protocol v1). Mirrors backend CredentialKeyFingerprint.java.
//
// Before a voter's browser blinds a token for an election, it checks that the RSA key it was given while
// signed in is the election's single published key:
//   1. the key is well formed (>= 2048-bit odd modulus, exponent 65537, expected version/protocol/election);
//   2. its fingerprint, computed here over the canonical representation, equals the published fingerprint;
//   3. the signed-in response equals the anonymous, election-wide public anchor (same for every caller);
//   4. the fingerprint equals the one this browser saw before for this election (pinned).
// Any failure stops the voting flow (fail closed): a server handing one voter a different key could
// otherwise recognize that voter's ballot later by which key verifies it.

const KEY_VERSION = 'DIGI-VOTE-CREDENTIAL-KEY-v1';
const KEY_PROTOCOL = 'RSA-FDH-BLIND/MGF1-SHA256/DIGI-VOTE-FDH-v1';
const PIN_KEY = 'digivote.credentialKeyPins';

class KeyTransparencyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new KeyTransparencyError(code, message);
};

function canonicalHex(value) {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]+$/.test(value)) return null;
  const n = BigInt('0x' + value);
  return n > 0n ? n.toString(16) : null;
}

function canonicalKeyString(electionId, modulusHex, exponentHex) {
  return `${KEY_VERSION}\nprotocol=${KEY_PROTOCOL}\nelection=${electionId}\nn=${canonicalHex(modulusHex)}\ne=${canonicalHex(exponentHex)}`;
}

async function credentialKeyFingerprint(electionId, modulusHex, exponentHex) {
  const bytes = new TextEncoder().encode(canonicalKeyString(electionId, modulusHex, exponentHex));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

function validateShape(key, electionId, label) {
  if (!key || typeof key !== 'object') fail('KEY_MISSING', `The ${label} credential key is missing.`);
  if (key.version !== KEY_VERSION || key.protocol !== KEY_PROTOCOL) {
    fail('KEY_PROTOCOL', `The ${label} credential key uses an unexpected protocol version.`);
  }
  if (String(key.electionId) !== String(electionId)) fail('KEY_ELECTION', `The ${label} credential key belongs to another election.`);
  const n = canonicalHex(key.modulusHex);
  const e = canonicalHex(key.publicExponentHex);
  if (!n || !e) fail('KEY_MALFORMED', `The ${label} credential key is malformed.`);
  const bits = BigInt('0x' + n).toString(2).length;
  if (bits < 2048 || (BigInt('0x' + n) & 1n) === 0n) fail('KEY_MALFORMED', `The ${label} credential key is too weak or invalid.`);
  if (e !== '10001') fail('KEY_MALFORMED', `The ${label} credential key has an unexpected public exponent.`);
  if (typeof key.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(key.fingerprint)) {
    fail('KEY_MALFORMED', `The ${label} credential key has no valid fingerprint.`);
  }
}

function readPins() {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Verifies the key returned to the signed-in voter against the public anchor and the pinned fingerprint.
 * @returns the verified fingerprint
 */
async function verifyElectionCredentialKey(electionId, sessionKey, publicAnchor, { pin = true } = {}) {
  validateShape(sessionKey, electionId, 'received');
  validateShape(publicAnchor, electionId, 'published');
  const computed = await credentialKeyFingerprint(electionId, sessionKey.modulusHex, sessionKey.publicExponentHex);
  if (computed !== sessionKey.fingerprint) fail('KEY_FINGERPRINT_MISMATCH', 'The credential key does not match its own fingerprint.');
  const anchorComputed = await credentialKeyFingerprint(electionId, publicAnchor.modulusHex, publicAnchor.publicExponentHex);
  if (anchorComputed !== publicAnchor.fingerprint) fail('KEY_FINGERPRINT_MISMATCH', 'The published credential key does not match its fingerprint.');
  if (computed !== anchorComputed) {
    fail('KEY_SUBSTITUTED', 'The credential key sent to you differs from the election’s published key. Do not vote; report this to the election auditor.');
  }
  const pins = readPins();
  if (pins[electionId] && pins[electionId] !== computed) {
    fail('KEY_CHANGED', 'This election’s credential key changed since you last used it. Do not vote; report this to the election auditor.');
  }
  if (pin && !pins[electionId]) {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify({ ...pins, [electionId]: computed }));
    } catch {
      /* storage unavailable: anchor comparison still applies */
    }
  }
  return computed;
}

  window.DV_CRYPTO = {
    hexToBigInt, bigIntToHex, bytesToHex, hexToBytes, modPow, modInverse, fullDomainHash,
    prepareCredential, unblind, verifyCredential, randomNonceHex,
    KEY_VERSION, KEY_PROTOCOL, KeyTransparencyError, canonicalKeyString, credentialKeyFingerprint, verifyElectionCredentialKey,
  };
})();
