package com.digivote.voting;

import com.digivote.common.Hashing;
import com.digivote.crypto.KeyVault;
import com.digivote.crypto.SecureTokens;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Locale;

/**
 * Receipt codes: 20 Crockford-base32 characters (100 bits) derived as
 * HMAC-SHA256(receiptKey, electionId | spentTokenHash), plus one check character, shown as
 * XXXXX-XXXXX-XXXXX-XXXXX-C. Deriving the code from the spent token lets a retried submission
 * return the same receipt without storing the code; only SHA-256(code) is persisted.
 */
@Component
public class ReceiptCodes {

    private final byte[] receiptKey;

    public ReceiptCodes(KeyVault vault) {
        this.receiptKey = vault.deriveKey("receipt-codes-v1");
    }

    public String derive(Long electionId, String tokenHash) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(receiptKey, "HmacSHA256"));
            byte[] digest = mac.doFinal((electionId + "|" + tokenHash).getBytes(StandardCharsets.UTF_8));
            String body = SecureTokens.base32(digest, 20);
            return format(body + SecureTokens.checkCharacter(body));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Receipt derivation failed", e);
        }
    }

    public static String format(String compact) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < compact.length(); i++) {
            if (i > 0 && i % 5 == 0) {
                sb.append('-');
            }
            sb.append(compact.charAt(i));
        }
        return sb.toString();
    }

    /** @return the compact normalized code, or null when the format or check character is invalid */
    public static String normalizeAndCheck(String input) {
        if (input == null) {
            return null;
        }
        String compact = input.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT)
                .replace('O', '0').replace('I', '1').replace('L', '1');
        if (compact.length() != 21 || !SecureTokens.isBase32(compact)) {
            return null;
        }
        String body = compact.substring(0, 20);
        return SecureTokens.checkCharacter(body) == compact.charAt(20) ? compact : null;
    }

    public static String hash(String compact) {
        return Hashing.sha256Hex("DIGI-VOTE-RECEIPT|" + compact);
    }
}
