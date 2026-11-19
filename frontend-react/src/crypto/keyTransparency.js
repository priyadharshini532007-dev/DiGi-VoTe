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

export const KEY_VERSION = 'DIGI-VOTE-CREDENTIAL-KEY-v1';
export const KEY_PROTOCOL = 'RSA-FDH-BLIND/MGF1-SHA256/DIGI-VOTE-FDH-v1';
const PIN_KEY = 'digivote.credentialKeyPins';

export class KeyTransparencyError extends Error {
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

export function canonicalKeyString(electionId, modulusHex, exponentHex) {
  return `${KEY_VERSION}\nprotocol=${KEY_PROTOCOL}\nelection=${electionId}\nn=${canonicalHex(modulusHex)}\ne=${canonicalHex(exponentHex)}`;
}

export async function credentialKeyFingerprint(electionId, modulusHex, exponentHex) {
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
export async function verifyElectionCredentialKey(electionId, sessionKey, publicAnchor, { pin = true } = {}) {
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
