package com.digivote.voting;

import com.digivote.crypto.KeyVault;
import com.digivote.common.Hashing;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;

/**
 * Signed QR receipt content: {@code DIGIVOTE|QR1|receiptCode|electionId|issuedAtMillis|ballotCommitment|signature}.
 * The signature is HMAC-SHA256 under a key derived from the server master key, so the content is checked statelessly:
 * the server stores no issue time, and no token or voter appears in it.
 */
@Component
public class QrReceipts {

    public static final long WINDOW_MILLIS = 30_000L;

    private final byte[] key;

    public QrReceipts(KeyVault vault) {
        this.key = vault.deriveKey("qr-receipt-v1");
    }

    public record Parsed(String receiptCode, long electionId, long issuedAtMillis, String commitment, String signature) {
    }

    public String payload(Long electionId, String receiptCode, long issuedAtMillis, String commitment) {
        return base(electionId, receiptCode, issuedAtMillis, commitment) + "|" + sign(electionId, receiptCode, issuedAtMillis, commitment);
    }

    /** @return the parsed content when the format and signature are valid, otherwise null */
    public Parsed parseAndVerify(String text) {
        if (text == null) {
            return null;
        }
        String[] p = text.trim().split("\\|");
        if (p.length != 7 || !"DIGIVOTE".equals(p[0]) || !"QR1".equals(p[1])) {
            return null;
        }
        try {
            long eid = Long.parseLong(p[3]);
            long at = Long.parseLong(p[4]);
            if (!Hashing.constantTimeEquals(sign(eid, p[2], at, p[5]), p[6])) {
                return null;
            }
            return new Parsed(p[2], eid, at, p[5], p[6]);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String base(Long electionId, String code, long issuedAt, String commitment) {
        return "DIGIVOTE|QR1|" + code + "|" + electionId + "|" + issuedAt + "|" + commitment;
    }

    private String sign(long electionId, String code, long issuedAt, String commitment) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] d = mac.doFinal(base(electionId, code, issuedAt, commitment).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d).substring(0, 24);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("QR signing failed", e);
        }
    }
}
