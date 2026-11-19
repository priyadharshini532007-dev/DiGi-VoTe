import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { credentialKeyFingerprint, KEY_PROTOCOL, KEY_VERSION, verifyElectionCredentialKey } from './keyTransparency.js';

const hex = (b64) => Buffer.from(b64, 'base64url').toString('hex').replace(/^0+/, '');

async function keyFor(electionId, bits = 2048) {
  const jwk = generateKeyPairSync('rsa', { modulusLength: bits }).publicKey.export({ format: 'jwk' });
  const modulusHex = hex(jwk.n);
  return { electionId, version: KEY_VERSION, protocol: KEY_PROTOCOL, modulusHex, publicExponentHex: '10001',
    fingerprint: await credentialKeyFingerprint(electionId, modulusHex, '10001') };
}

const expectCode = async (promise, code) => {
  await expect(promise).rejects.toMatchObject({ code });
};

describe('credential key transparency', () => {
  beforeEach(() => localStorage.clear());

  it('matches the Java fingerprint vector', async () => {
    expect(await credentialKeyFingerprint(42, 'c5f1a1d3' + '9b'.repeat(124), '010001'))
      .toBe('a9f712af0d8346c6ade1c1ad1a2bd9421ca801a0896740681aa43f84860e3991');
  });

  it('accepts the published key and pins its fingerprint', async () => {
    const key = await keyFor(7);
    expect(await verifyElectionCredentialKey(7, key, { ...key })).toBe(key.fingerprint);
    expect(JSON.parse(localStorage.getItem('digivote.credentialKeyPins'))['7']).toBe(key.fingerprint);
  });

  it('rejects a substituted key sent to one voter', async () => {
    const published = await keyFor(7);
    const forThisVoter = await keyFor(7);
    await expectCode(verifyElectionCredentialKey(7, forThisVoter, published), 'KEY_SUBSTITUTED');
  });

  it('rejects a key whose fingerprint does not match', async () => {
    const key = await keyFor(7);
    await expectCode(verifyElectionCredentialKey(7, { ...key, fingerprint: 'a'.repeat(64) }, key), 'KEY_FINGERPRINT_MISMATCH');
    await expectCode(verifyElectionCredentialKey(7, key, { ...key, fingerprint: 'b'.repeat(64) }), 'KEY_FINGERPRINT_MISMATCH');
  });

  it('rejects a key that changed after it was pinned (rotation)', async () => {
    const first = await keyFor(7);
    await verifyElectionCredentialKey(7, first, first);
    const rotated = await keyFor(7);
    await expectCode(verifyElectionCredentialKey(7, rotated, rotated), 'KEY_CHANGED');
  });

  it('rejects keys bound to another election or protocol', async () => {
    const other = await keyFor(8);
    await expectCode(verifyElectionCredentialKey(7, other, other), 'KEY_ELECTION');
    const key = await keyFor(7);
    await expectCode(verifyElectionCredentialKey(7, { ...key, protocol: 'RSA-PSS' }, key), 'KEY_PROTOCOL');
    // Fingerprints are election-bound: the same key yields a different fingerprint for another election.
    expect(await credentialKeyFingerprint(8, key.modulusHex, '10001')).not.toBe(key.fingerprint);
  });

  it('rejects missing and malformed keys', async () => {
    const key = await keyFor(7);
    await expectCode(verifyElectionCredentialKey(7, null, key), 'KEY_MISSING');
    await expectCode(verifyElectionCredentialKey(7, { ...key, modulusHex: 'zz' }, key), 'KEY_MALFORMED');
    await expectCode(verifyElectionCredentialKey(7, { ...key, modulusHex: 'ab'.repeat(64) + '1' }, key), 'KEY_MALFORMED');
    await expectCode(verifyElectionCredentialKey(7, { ...key, modulusHex: key.modulusHex.slice(0, -1) + '2' }, key), 'KEY_MALFORMED');
    await expectCode(verifyElectionCredentialKey(7, { ...key, publicExponentHex: '3' }, key), 'KEY_MALFORMED');
    await expectCode(verifyElectionCredentialKey(7, { ...key, fingerprint: undefined }, key), 'KEY_MALFORMED');
  });
});
