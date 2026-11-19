package com.digivote.voting;

import com.digivote.crypto.KeyVault;
import com.digivote.crypto.SecureTokens;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptCodesTest {

    private static KeyVault vault() throws Exception {
        Constructor<KeyVault> c = KeyVault.class.getDeclaredConstructor(byte[].class);
        c.setAccessible(true);
        return c.newInstance((Object) SecureTokens.randomBytes(32));
    }

    @Test
    void codesAreDeterministicPerTokenFormattedAndChecksummed() throws Exception {
        ReceiptCodes codes = new ReceiptCodes(vault());
        String a = codes.derive(1L, "aa");
        assertThat(a).matches("[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]");
        assertThat(codes.derive(1L, "aa")).isEqualTo(a);
        assertThat(codes.derive(1L, "ab")).isNotEqualTo(a);
        assertThat(codes.derive(2L, "aa")).isNotEqualTo(a);
        assertThat(ReceiptCodes.normalizeAndCheck(a)).hasSize(21);
        assertThat(ReceiptCodes.normalizeAndCheck(a.toLowerCase())).isEqualTo(ReceiptCodes.normalizeAndCheck(a));
    }

    @Test
    void typosAndGarbageAreDetected() throws Exception {
        String a = new ReceiptCodes(vault()).derive(5L, "token");
        char swapped = a.charAt(0) == '0' ? '1' : '0';
        String typo = swapped + a.substring(1);
        assertThat(ReceiptCodes.normalizeAndCheck(typo)).isNull();
        assertThat(ReceiptCodes.normalizeAndCheck("short")).isNull();
        assertThat(ReceiptCodes.normalizeAndCheck("<script>alert(1)</script>")).isNull();
        assertThat(ReceiptCodes.normalizeAndCheck(null)).isNull();
    }
}
