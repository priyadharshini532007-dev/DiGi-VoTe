package com.digivote.crypto;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.security.SecureRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PaillierTest {

    private static Paillier.KeyPair keys;
    private static final SecureRandom RANDOM = new SecureRandom();

    @BeforeAll
    static void generate() {
        keys = Paillier.generate(1024, RANDOM);
    }

    @Test
    void textbookVectorDecryptsToKnownPlaintext() {
        // p = 293, q = 433 -> n = 126869, lambda = 31536, mu = 42173; Enc(42) with r = 23 = 5276179749
        Paillier.PublicKey pub = new Paillier.PublicKey(BigInteger.valueOf(126869));
        Paillier.PrivateKey priv = new Paillier.PrivateKey(pub, BigInteger.valueOf(31536), BigInteger.valueOf(42173));
        assertThat(Paillier.decrypt(priv, BigInteger.valueOf(5276179749L))).isEqualTo(BigInteger.valueOf(42));
    }

    @Test
    void encryptDecryptRoundTrip() {
        for (long m : new long[]{0, 1, 2, 999_999}) {
            BigInteger c = Paillier.encrypt(keys.publicKey(), BigInteger.valueOf(m), RANDOM);
            assertThat(Paillier.decrypt(keys.privateKey(), c)).isEqualTo(BigInteger.valueOf(m));
        }
    }

    @Test
    void encryptionIsRandomized() {
        BigInteger c1 = Paillier.encrypt(keys.publicKey(), BigInteger.ONE, RANDOM);
        BigInteger c2 = Paillier.encrypt(keys.publicKey(), BigInteger.ONE, RANDOM);
        assertThat(c1).isNotEqualTo(c2);
    }

    @Test
    void homomorphicAdditionSumsVotesWithoutDecryptingThem() {
        BigInteger acc = Paillier.identity();
        int[] ballots = {1, 0, 1, 1, 0, 1};
        for (int b : ballots) {
            acc = Paillier.add(keys.publicKey(), acc, Paillier.encrypt(keys.publicKey(), BigInteger.valueOf(b), RANDOM));
        }
        assertThat(Paillier.decrypt(keys.privateKey(), acc)).isEqualTo(BigInteger.valueOf(4));
    }

    @Test
    void identityDecryptsToZero() {
        assertThat(Paillier.decrypt(keys.privateKey(), Paillier.identity())).isEqualTo(BigInteger.ZERO);
    }

    @Test
    void rejectsInvalidCiphertextsAndPlaintexts() {
        assertThatThrownBy(() -> Paillier.decrypt(keys.privateKey(), BigInteger.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Paillier.decrypt(keys.privateKey(), keys.publicKey().nSquared()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Paillier.encrypt(keys.publicKey(), BigInteger.valueOf(-1), RANDOM))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Paillier.encrypt(keys.publicKey(), keys.publicKey().n(), RANDOM))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void refusesWeakKeySizes() {
        assertThatThrownBy(() -> Paillier.generate(512, RANDOM)).isInstanceOf(IllegalArgumentException.class);
        assertThat(keys.publicKey().bitLength()).isEqualTo(1024);
    }

    @Test
    void privateKeyToStringDoesNotLeakMaterial() {
        assertThat(keys.privateKey().toString()).doesNotContain(keys.privateKey().lambda().toString());
    }
}
