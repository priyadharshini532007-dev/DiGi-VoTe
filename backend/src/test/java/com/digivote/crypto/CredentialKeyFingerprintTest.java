package com.digivote.crypto;

import org.junit.jupiter.api.Test;

import java.math.BigInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CredentialKeyFingerprintTest {

    private static final BigInteger N = new BigInteger("c5f1a1d3" + "9b".repeat(124), 16);
    private static final BigInteger E = BigInteger.valueOf(65537);

    @Test
    void matchesTheCrossLanguageVector() {
        // Same vector is asserted in frontend/src/crypto/keyTransparency.test.js.
        assertThat(CredentialKeyFingerprint.of(42, N, E))
                .isEqualTo("a9f712af0d8346c6ade1c1ad1a2bd9421ca801a0896740681aa43f84860e3991");
    }

    @Test
    void isCanonicalAcrossHexEncodings() {
        assertThat(CredentialKeyFingerprint.of(42, "00" + N.toString(16).toUpperCase(), "010001"))
                .isEqualTo(CredentialKeyFingerprint.of(42, N, E));
    }

    @Test
    void bindsElectionProtocolAndKey() {
        String base = CredentialKeyFingerprint.of(42, N, E);
        assertThat(CredentialKeyFingerprint.of(43, N, E)).isNotEqualTo(base);
        assertThat(CredentialKeyFingerprint.of(42, N.add(BigInteger.TWO), E)).isNotEqualTo(base);
        assertThat(CredentialKeyFingerprint.of(42, N, BigInteger.valueOf(3))).isNotEqualTo(base);
        assertThat(CredentialKeyFingerprint.canonical(42, N, E)).startsWith("DIGI-VOTE-CREDENTIAL-KEY-v1\nprotocol=")
                .contains("\nelection=42\n");
    }

    @Test
    void rejectsInvalidKeys() {
        assertThatThrownBy(() -> CredentialKeyFingerprint.of(1, BigInteger.ZERO, E)).isInstanceOf(IllegalArgumentException.class);
    }
}
