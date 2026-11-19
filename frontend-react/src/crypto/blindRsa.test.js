import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bytesToHex, fullDomainHash, hexToBigInt, modPow, prepareCredential, unblind, verifyCredential } from './blindRsa.js';

function b64urlToBigInt(s) {
  return BigInt('0x' + Buffer.from(s, 'base64url').toString('hex'));
}

function testKey() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
  const jwk = privateKey.export({ format: 'jwk' });
  const n = b64urlToBigInt(jwk.n);
  return { n, e: b64urlToBigInt(jwk.e), d: b64urlToBigInt(jwk.d), key: { modulusHex: n.toString(16), publicExponentHex: b64urlToBigInt(jwk.e).toString(16) } };
}

describe('RSA-FDH blind signatures (voter side)', () => {
  it('matches the Java full-domain-hash test vector', async () => {
    const n = hexToBigInt('c5f1a1d3' + '9b'.repeat(124));
    const token = Uint8Array.from({ length: 32 }, (_, i) => i);
    const h = await fullDomainHash(token, n);
    expect(h.toString(16)).toBe(
      '1bfec053107a6f64a093a3ef004462e03b665c1f7e41772f95618fc77d61885b3032cfaae711b15d7fa56361f84693af'
      + 'ed09e25561b5d975b75d046d6b9b141ef50f822ca98994dba0351833e7bfc431fcf37fb40198dcb48542aa2a'
      + '76368220c24edd3c725422a3f22320797a5d0f194c49e9b7e6686b42651850c3f911cbf5');
  });

  it('blinds, gets signed without revealing the token, unblinds and verifies', async () => {
    const { n, d, key } = testKey();
    const prepared = await prepareCredential(key);
    const m = await fullDomainHash(Buffer.from(prepared.tokenHex, 'hex'), n);
    expect(hexToBigInt(prepared.blindedMessageHex)).not.toBe(m); // signer sees only the blinded value
    const blindSig = modPow(hexToBigInt(prepared.blindedMessageHex), d, n); // what the server does
    const sig = unblind(blindSig.toString(16), prepared.blindingFactorHex, key);
    expect(await verifyCredential(prepared.tokenHex, sig, key)).toBe(true);
    expect(await verifyCredential(bytesToHex(randomBytes(32)), sig, key)).toBe(false);
  });

  it('produces a fresh token and blinding for every credential', async () => {
    const { key } = testKey();
    const a = await prepareCredential(key);
    const b = await prepareCredential(key);
    expect(a.tokenHex).not.toBe(b.tokenHex);
    expect(a.blindedMessageHex).not.toBe(b.blindedMessageHex);
    expect(a.tokenHex).toHaveLength(64);
  });
});
