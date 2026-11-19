package com.digivote.crypto;

import com.digivote.common.Hashing;

import java.math.BigInteger;

/**
 * Canonical fingerprint of an election's blind-signature (credential) public key, protocol version 1.
 *
 * <pre>
 * DIGI-VOTE-CREDENTIAL-KEY-v1\n
 * protocol=RSA-FDH-BLIND/MGF1-SHA256/DIGI-VOTE-FDH-v1\n
 * election=&lt;decimal election id&gt;\n
 * n=&lt;modulus, lowercase hex, no leading zeros&gt;\n
 * e=&lt;public exponent, lowercase hex, no leading zeros&gt;
 * </pre>
 * fingerprint = lowercase hex SHA-256 of the UTF-8 bytes. Binding the election id and protocol means a key
 * (or fingerprint) from another election or protocol version can never match. The browser computes the same
 * value (frontend/src/crypto/keyTransparency.js) and refuses any key that does not match the published one.
 */
public final class CredentialKeyFingerprint {

    public static final String VERSION = "DIGI-VOTE-CREDENTIAL-KEY-v1";
    public static final String PROTOCOL = "RSA-FDH-BLIND/MGF1-SHA256/DIGI-VOTE-FDH-v1";

    private CredentialKeyFingerprint() {
    }

    public static String canonical(long electionId, BigInteger modulus, BigInteger exponent) {
        if (modulus.signum() <= 0 || exponent.signum() <= 0) {
            throw new IllegalArgumentException("Invalid RSA public key");
        }
        return VERSION + "\nprotocol=" + PROTOCOL + "\nelection=" + electionId + "\nn=" + modulus.toString(16)
                + "\ne=" + exponent.toString(16);
    }

    public static String of(long electionId, BigInteger modulus, BigInteger exponent) {
        return Hashing.sha256Hex(canonical(electionId, modulus, exponent));
    }

    public static String of(long electionId, String modulusHex, String exponentHex) {
        return of(electionId, new BigInteger(modulusHex, 16), new BigInteger(exponentHex, 16));
    }
}
