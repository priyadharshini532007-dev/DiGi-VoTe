// DIGI-VOTE voter-side RSA blind signature protocol (Chaum, RSA-FDH).
// Mirrors backend/src/main/java/com/digivote/crypto/BlindRsa.java. Runs in the browser (and Node 20+)
// using native BigInt and Web Crypto. The unblinded token and blinding factor never leave this device
// until the token is spent with the ballot.

const DOMAIN = new TextEncoder().encode('DIGI-VOTE-FDH-v1');

export function hexToBigInt(hex) {
  return BigInt('0x' + hex);
}

export function bigIntToHex(value) {
  return value.toString(16);
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bitLength(n) {
  return n.toString(2).length;
}

export function modPow(base, exp, mod) {
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

export function modInverse(a, n) {
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
export async function fullDomainHash(tokenBytes, n) {
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
export async function prepareCredential(key) {
  const n = hexToBigInt(key.modulusHex);
  const e = hexToBigInt(key.publicExponentHex);
  const token = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const m = await fullDomainHash(token, n);
  const r = randomBigIntBelow(n);
  const blinded = (m * modPow(r, e, n)) % n;
  return { tokenHex: bytesToHex(token), blindingFactorHex: bigIntToHex(r), blindedMessageHex: bigIntToHex(blinded) };
}

/** Step 2 (voter device): remove the blinding factor from the server's signature. */
export function unblind(blindSignatureHex, blindingFactorHex, key) {
  const n = hexToBigInt(key.modulusHex);
  const s = (hexToBigInt(blindSignatureHex) * modInverse(hexToBigInt(blindingFactorHex), n)) % n;
  return bigIntToHex(s);
}

/** Checks s^e mod n == FDH(token) before the credential is used. */
export async function verifyCredential(tokenHex, signatureHex, key) {
  const n = hexToBigInt(key.modulusHex);
  const e = hexToBigInt(key.publicExponentHex);
  return modPow(hexToBigInt(signatureHex), e, n) === (await fullDomainHash(hexToBytes(tokenHex), n));
}

export function randomNonceHex() {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}
