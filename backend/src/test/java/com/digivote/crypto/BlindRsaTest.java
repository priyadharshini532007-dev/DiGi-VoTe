package com.digivote.crypto;

import org.bouncycastle.crypto.AsymmetricCipherKeyPair;
import org.bouncycastle.crypto.params.RSAKeyParameters;
import org.bouncycastle.crypto.params.RSAPrivateCrtKeyParameters;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.security.SecureRandom;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BlindRsaTest {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static RSAKeyParameters pub;
    private static RSAPrivateCrtKeyParameters priv;

    @BeforeAll
    static void keys() {
        AsymmetricCipherKeyPair pair = BlindRsa.generate(2048, RANDOM);
        pub = (RSAKeyParameters) pair.getPublic();
        priv = (RSAPrivateCrtKeyParameters) pair.getPrivate();
    }

    @Test
    void fullDomainHashMatchesCrossLanguageVector() {
        // Same vector is asserted by frontend/src/crypto/blindRsa.test.js, proving Java and browser agree.
        BigInteger n = new BigInteger("c5f1a1d3" + "9b".repeat(124), 16);
        byte[] token = new byte[32];
        for (int i = 0; i < 32; i++) {
            token[i] = (byte) i;
        }
        assertThat(BlindRsa.fullDomainHash(token, n).toString(16)).isEqualTo(
                "1bfec053107a6f64a093a3ef004462e03b665c1f7e41772f95618fc77d61885b3032cfaae711b15d7fa56361f84693af"
                        + "ed09e25561b5d975b75d046d6b9b141ef50f822ca98994dba0351833e7bfc431fcf37fb40198dcb48542aa2a"
                        + "76368220c24edd3c725422a3f22320797a5d0f194c49e9b7e6686b42651850c3f911cbf5");
    }

    @Test
    void blindSignUnblindVerifyProtocol() {
        byte[] token = SecureTokens.randomBytes(32);
        BigInteger m = BlindRsa.fullDomainHash(token, pub.getModulus());
        BigInteger r = BlindRsa.randomBlindingFactor(pub.getModulus(), RANDOM);
        BigInteger blinded = BlindRsa.blind(pub, m, r);
        BigInteger blindSig = BlindRsa.signBlinded(priv, blinded);
        BigInteger sig = BlindRsa.unblind(pub, blindSig, r);
        assertThat(BlindRsa.verify(pub, token, sig)).isTrue();
    }

    @Test
    void signerNeverSeesTheMessageOrFinalSignature() {
        byte[] token = SecureTokens.randomBytes(32);
        BigInteger m = BlindRsa.fullDomainHash(token, pub.getModulus());
        BigInteger r1 = BlindRsa.randomBlindingFactor(pub.getModulus(), RANDOM);
        BigInteger r2 = BlindRsa.randomBlindingFactor(pub.getModulus(), RANDOM);
        BigInteger b1 = BlindRsa.blind(pub, m, r1);
        BigInteger b2 = BlindRsa.blind(pub, m, r2);
        assertThat(b1).isNotEqualTo(m).isNotEqualTo(b2);
        BigInteger s1 = BlindRsa.signBlinded(priv, b1);
        BigInteger finalSig = BlindRsa.unblind(pub, s1, r1);
        assertThat(finalSig).isNotEqualTo(s1);
        // Both blindings unblind to the same unique RSA-FDH signature: the signer cannot tell which request it came from.
        assertThat(BlindRsa.unblind(pub, BlindRsa.signBlinded(priv, b2), r2)).isEqualTo(finalSig);
    }

    @Test
    void rejectsForgedOrMismatchedCredentials() {
        byte[] token = SecureTokens.randomBytes(32);
        BigInteger m = BlindRsa.fullDomainHash(token, pub.getModulus());
        BigInteger r = BlindRsa.randomBlindingFactor(pub.getModulus(), RANDOM);
        BigInteger sig = BlindRsa.unblind(pub, BlindRsa.signBlinded(priv, BlindRsa.blind(pub, m, r)), r);
        byte[] other = token.clone();
        other[0] ^= 1;
        assertThat(BlindRsa.verify(pub, other, sig)).isFalse();
        assertThat(BlindRsa.verify(pub, token, sig.add(BigInteger.ONE))).isFalse();
        assertThat(BlindRsa.verify(pub, token, BigInteger.ZERO)).isFalse();
        assertThat(BlindRsa.verify(pub, token, pub.getModulus())).isFalse();
    }

    @Test
    void signatureFromAnotherKeyIsRejected() {
        AsymmetricCipherKeyPair other = BlindRsa.generate(2048, RANDOM);
        byte[] token = HexFormat.of().parseHex("00".repeat(32));
        RSAKeyParameters otherPub = (RSAKeyParameters) other.getPublic();
        BigInteger m = BlindRsa.fullDomainHash(token, otherPub.getModulus());
        BigInteger r = BlindRsa.randomBlindingFactor(otherPub.getModulus(), RANDOM);
        BigInteger sig = BlindRsa.unblind(otherPub,
                BlindRsa.signBlinded((RSAPrivateCrtKeyParameters) other.getPrivate(), BlindRsa.blind(otherPub, m, r)), r);
        assertThat(BlindRsa.verify(pub, token, sig)).isFalse();
    }

    @Test
    void rejectsOutOfRangeBlindedMessagesAndWeakKeys() {
        assertThatThrownBy(() -> BlindRsa.signBlinded(priv, pub.getModulus())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BlindRsa.signBlinded(priv, BigInteger.ZERO)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BlindRsa.generate(1024, RANDOM)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void fullDomainHashIsBelowModulus() {
        for (int i = 0; i < 20; i++) {
            assertThat(BlindRsa.fullDomainHash(SecureTokens.randomBytes(32), pub.getModulus())).isLessThan(pub.getModulus());
        }
    }
}
