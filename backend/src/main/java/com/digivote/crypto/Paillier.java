package com.digivote.crypto;

import java.math.BigInteger;
import java.security.SecureRandom;

/**
 * Paillier additively homomorphic public-key encryption (Paillier, EUROCRYPT 1999), using the
 * standard simplification g = n + 1.
 *
 * <ul>
 *   <li>KeyGen: random primes p, q of equal length with gcd(pq, (p-1)(q-1)) = 1; n = pq,
 *       lambda = lcm(p-1, q-1), mu = lambda^-1 mod n.</li>
 *   <li>Enc(m) = (1 + m*n) * r^n mod n^2 with r uniformly random in Z*_n.</li>
 *   <li>Dec(c) = L(c^lambda mod n^2) * mu mod n, where L(x) = (x - 1) / n.</li>
 *   <li>Enc(a) * Enc(b) mod n^2 = Enc(a + b): used to tally ballots without decrypting any of them.</li>
 * </ul>
 *
 * Built only from {@link BigInteger} arithmetic and {@link SecureRandom}; no custom primitives.
 */
public final class Paillier {

    private Paillier() {
    }

    public record PublicKey(BigInteger n) {
        public BigInteger nSquared() {
            return n.multiply(n);
        }

        public BigInteger g() {
            return n.add(BigInteger.ONE);
        }

        public int bitLength() {
            return n.bitLength();
        }
    }

    public record PrivateKey(PublicKey publicKey, BigInteger lambda, BigInteger mu) {
        @Override
        public String toString() {
            return "Paillier.PrivateKey[redacted]";
        }
    }

    public record KeyPair(PublicKey publicKey, PrivateKey privateKey) {
    }

    public static KeyPair generate(int modulusBits, SecureRandom random) {
        if (modulusBits < 1024) {
            throw new IllegalArgumentException("Paillier modulus must be at least 1024 bits");
        }
        while (true) {
            BigInteger p = BigInteger.probablePrime(modulusBits / 2, random);
            BigInteger q = BigInteger.probablePrime(modulusBits / 2, random);
            if (p.equals(q)) {
                continue;
            }
            BigInteger n = p.multiply(q);
            BigInteger pm1 = p.subtract(BigInteger.ONE);
            BigInteger qm1 = q.subtract(BigInteger.ONE);
            if (!n.gcd(pm1.multiply(qm1)).equals(BigInteger.ONE) || n.bitLength() != modulusBits) {
                continue;
            }
            BigInteger lambda = pm1.multiply(qm1).divide(pm1.gcd(qm1));
            BigInteger mu = lambda.modInverse(n);
            PublicKey pub = new PublicKey(n);
            return new KeyPair(pub, new PrivateKey(pub, lambda, mu));
        }
    }

    public static BigInteger encrypt(PublicKey key, BigInteger m, SecureRandom random) {
        if (m.signum() < 0 || m.compareTo(key.n()) >= 0) {
            throw new IllegalArgumentException("Plaintext out of range");
        }
        BigInteger n = key.n();
        BigInteger nSquared = key.nSquared();
        BigInteger r;
        do {
            r = new BigInteger(n.bitLength(), random);
        } while (r.signum() == 0 || r.compareTo(n) >= 0 || !r.gcd(n).equals(BigInteger.ONE));
        // (1 + m*n) mod n^2 equals g^m mod n^2 for g = n + 1
        BigInteger gm = BigInteger.ONE.add(m.multiply(n)).mod(nSquared);
        return gm.multiply(r.modPow(n, nSquared)).mod(nSquared);
    }

    public static BigInteger decrypt(PrivateKey key, BigInteger c) {
        PublicKey pub = key.publicKey();
        requireValidCiphertext(pub, c);
        BigInteger u = c.modPow(key.lambda(), pub.nSquared());
        BigInteger l = u.subtract(BigInteger.ONE).divide(pub.n());
        return l.multiply(key.mu()).mod(pub.n());
    }

    /** Homomorphic addition: Dec(add(Enc(a), Enc(b))) = a + b mod n. */
    public static BigInteger add(PublicKey key, BigInteger c1, BigInteger c2) {
        return c1.multiply(c2).mod(key.nSquared());
    }

    /** Encryption of zero with randomness 1: the neutral element for {@link #add}. */
    public static BigInteger identity() {
        return BigInteger.ONE;
    }

    public static void requireValidCiphertext(PublicKey key, BigInteger c) {
        if (c.signum() <= 0 || c.compareTo(key.nSquared()) >= 0 || !c.gcd(key.n()).equals(BigInteger.ONE)) {
            throw new IllegalArgumentException("Invalid Paillier ciphertext");
        }
    }
}
