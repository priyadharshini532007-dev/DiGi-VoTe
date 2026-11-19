package com.digivote.crypto;

import org.bouncycastle.crypto.AsymmetricCipherKeyPair;
import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.crypto.engines.RSABlindingEngine;
import org.bouncycastle.crypto.engines.RSAEngine;
import org.bouncycastle.crypto.generators.MGF1BytesGenerator;
import org.bouncycastle.crypto.generators.RSAKeyPairGenerator;
import org.bouncycastle.crypto.params.MGFParameters;
import org.bouncycastle.crypto.params.RSABlindingParameters;
import org.bouncycastle.crypto.params.RSAKeyGenerationParameters;
import org.bouncycastle.crypto.params.RSAKeyParameters;
import org.bouncycastle.crypto.params.RSAPrivateCrtKeyParameters;

import org.bouncycastle.util.BigIntegers;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

/**
 * Chaum RSA blind signatures over a full-domain hash (RSA-FDH), built on Bouncy Castle.
 *
 * <p>Protocol (the voter's browser performs the client steps, see frontend/src/crypto/blindRsa.js):
 * <ol>
 *   <li>Client picks a random 32-byte token t and computes m = FDH(t).</li>
 *   <li>Client picks random r in Z*_n and sends the blinded value m' = m * r^e mod n.</li>
 *   <li>Server checks eligibility and returns s' = m'^d mod n (it learns nothing about m).</li>
 *   <li>Client unblinds: s = s' * r^-1 mod n, a valid signature on m.</li>
 *   <li>Ballot submission presents (t, s); anyone with (n, e) checks s^e mod n == FDH(t).</li>
 * </ol>
 *
 * <p>FDH(t) = MGF1-SHA256("DIGI-VOTE-FDH-v1" || t) expanded to the modulus byte length with the
 * top bit cleared, so the value is always below n. This is the classic RSA-FDH construction;
 * RFC 9474 (RSABSSA-PSS) is the newer standardized variant and is noted as a future upgrade.
 */
public final class BlindRsa {

    private static final byte[] DOMAIN = "DIGI-VOTE-FDH-v1".getBytes(StandardCharsets.UTF_8);
    public static final BigInteger PUBLIC_EXPONENT = BigInteger.valueOf(65537);

    private BlindRsa() {
    }

    public static AsymmetricCipherKeyPair generate(int bits, SecureRandom random) {
        if (bits < 2048) {
            throw new IllegalArgumentException("RSA blind-signature keys must be at least 2048 bits");
        }
        RSAKeyPairGenerator generator = new RSAKeyPairGenerator();
        generator.init(new RSAKeyGenerationParameters(PUBLIC_EXPONENT, random, bits, 112));
        return generator.generateKeyPair();
    }

    public static BigInteger fullDomainHash(byte[] token, BigInteger modulus) {
        int length = (modulus.bitLength() + 7) / 8;
        byte[] seed = new byte[DOMAIN.length + token.length];
        System.arraycopy(DOMAIN, 0, seed, 0, DOMAIN.length);
        System.arraycopy(token, 0, seed, DOMAIN.length, token.length);
        MGF1BytesGenerator mgf = new MGF1BytesGenerator(new SHA256Digest());
        mgf.init(new MGFParameters(seed));
        byte[] out = new byte[length];
        mgf.generateBytes(out, 0, length);
        BigInteger h = new BigInteger(1, out);
        // Keep the value strictly below 2^(bits-1) <= n.
        return h.mod(BigInteger.ONE.shiftLeft(modulus.bitLength() - 1));
    }

    /** Server side: raw RSA private operation on the blinded message (CRT, via Bouncy Castle). */
    public static BigInteger signBlinded(RSAPrivateCrtKeyParameters key, BigInteger blinded) {
        if (blinded.signum() <= 0 || blinded.compareTo(key.getModulus()) >= 0) {
            throw new IllegalArgumentException("Blinded message out of range");
        }
        RSAEngine engine = new RSAEngine();
        engine.init(true, key);
        byte[] in = BigIntegers.asUnsignedByteArray(blinded);
        return new BigInteger(1, engine.processBlock(in, 0, in.length));
    }

    public static boolean verify(RSAKeyParameters publicKey, byte[] token, BigInteger signature) {
        BigInteger n = publicKey.getModulus();
        if (signature.signum() <= 0 || signature.compareTo(n) >= 0) {
            return false;
        }
        BigInteger expected = fullDomainHash(token, n);
        return signature.modPow(publicKey.getExponent(), n).equals(expected);
    }

    // ---------------------------------------------------------------- client-side reference
    // Used by tests and documentation to show the full protocol; the browser implements the same steps.

    public static BigInteger blind(RSAKeyParameters publicKey, BigInteger message, BigInteger r) {
        RSABlindingEngine engine = new RSABlindingEngine();
        engine.init(true, new RSABlindingParameters(publicKey, r));
        byte[] in = BigIntegers.asUnsignedByteArray(message);
        return new BigInteger(1, engine.processBlock(in, 0, in.length));
    }

    public static BigInteger unblind(RSAKeyParameters publicKey, BigInteger blindSignature, BigInteger r) {
        RSABlindingEngine engine = new RSABlindingEngine();
        engine.init(false, new RSABlindingParameters(publicKey, r));
        byte[] in = BigIntegers.asUnsignedByteArray(blindSignature);
        return new BigInteger(1, engine.processBlock(in, 0, in.length));
    }

    public static BigInteger randomBlindingFactor(BigInteger n, SecureRandom random) {
        BigInteger r;
        do {
            r = new BigInteger(n.bitLength(), random);
        } while (r.compareTo(BigInteger.TWO) < 0 || r.compareTo(n) >= 0 || !r.gcd(n).equals(BigInteger.ONE));
        return r;
    }
}
