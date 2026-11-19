package com.digivote.crypto;

import java.security.SecureRandom;

/**
 * Secure random identifiers. Uses a single {@link SecureRandom} (thread-safe, OS-seeded).
 */
public final class SecureTokens {

    private static final SecureRandom RANDOM = new SecureRandom();
    /** Crockford base32 alphabet: no I, L, O, U to avoid transcription errors. */
    private static final char[] BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

    private SecureTokens() {
    }

    public static SecureRandom random() {
        return RANDOM;
    }

    public static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    /** Random Crockford base32 string carrying 5 bits of entropy per character. */
    public static String randomBase32(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(BASE32[RANDOM.nextInt(32)]);
        }
        return sb.toString();
    }

    public static String base32(byte[] bytes, int length) {
        StringBuilder sb = new StringBuilder(length);
        int buffer = 0;
        int bits = 0;
        int index = 0;
        while (sb.length() < length) {
            if (bits < 5) {
                buffer = (buffer << 8) | (bytes[index++ % bytes.length] & 0xff);
                bits += 8;
            }
            sb.append(BASE32[(buffer >> (bits - 5)) & 31]);
            bits -= 5;
        }
        return sb.toString();
    }

    public static boolean isBase32(String value) {
        for (char c : value.toCharArray()) {
            if (indexOf(c) < 0) {
                return false;
            }
        }
        return true;
    }

    public static int indexOf(char c) {
        for (int i = 0; i < BASE32.length; i++) {
            if (BASE32[i] == c) {
                return i;
            }
        }
        return -1;
    }

    public static char checkCharacter(String body) {
        int sum = 0;
        for (int i = 0; i < body.length(); i++) {
            sum = (sum * 33 + indexOf(body.charAt(i))) % 32;
        }
        return BASE32[sum];
    }
}
