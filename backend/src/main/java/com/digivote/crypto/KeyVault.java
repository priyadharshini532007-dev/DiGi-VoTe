package com.digivote.crypto;

import com.digivote.config.DigiVoteProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.util.Base64;

/**
 * Wraps election private keys with AES-256-GCM under the server master key
 * (DIGIVOTE_MASTER_KEY, 32 random bytes, base64).
 *
 * <p>In dev mode only, when no master key is configured, a key is generated once and stored in
 * {@code .local/dev-master.key} (git-ignored). Production must supply the key from a secret manager.
 */
@Component
public class KeyVault {

    private static final Logger log = LoggerFactory.getLogger(KeyVault.class);
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey masterKey;

    @org.springframework.beans.factory.annotation.Autowired
    public KeyVault(DigiVoteProperties properties) {
        this.masterKey = new SecretKeySpec(loadKey(properties), "AES");
    }

    KeyVault(byte[] rawKey) {
        this.masterKey = new SecretKeySpec(rawKey, "AES");
    }

    /**
     * @param aad associated data binding the ciphertext to its purpose (e.g. "election:42:rsa")
     */
    public String seal(String plaintext, String aad) {
        try {
            byte[] iv = SecureTokens.randomBytes(IV_BYTES);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, masterKey, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            byte[] ct = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Key sealing failed", e);
        }
    }

    /** Purpose-bound subkey: HMAC-SHA256(masterKey, "digi-vote:" + purpose). */
    public byte[] deriveKey(String purpose) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(masterKey.getEncoded(), "HmacSHA256"));
            return mac.doFinal(("digi-vote:" + purpose).getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Key derivation failed", e);
        }
    }

    public String open(String sealed, String aad) {
        try {
            byte[] all = Base64.getDecoder().decode(sealed);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, masterKey, new GCMParameterSpec(TAG_BITS, all, 0, IV_BYTES));
            cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            byte[] pt = cipher.doFinal(all, IV_BYTES, all.length - IV_BYTES);
            return new String(pt, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            // Never include key material or ciphertext in the message.
            throw new IllegalStateException("Key unsealing failed (wrong master key or tampered data)");
        }
    }

    private static byte[] loadKey(DigiVoteProperties properties) {
        String configured = properties.security().masterKey();
        if (configured != null && !configured.isBlank()) {
            byte[] key = Base64.getDecoder().decode(configured.trim());
            if (key.length != 32) {
                throw new IllegalStateException("DIGIVOTE_MASTER_KEY must be 32 bytes (base64)");
            }
            return key;
        }
        if (!properties.devMode()) {
            throw new IllegalStateException("DIGIVOTE_MASTER_KEY is required when dev mode is off");
        }
        return DevSecretFile.loadOrCreate(Path.of(properties.localDir(), "dev-master.key"), 32, log);
    }

    /** Dev-only persisted random secret, readable only by the current user. */
    static final class DevSecretFile {
        private DevSecretFile() {
        }

        static byte[] loadOrCreate(Path file, int bytes, Logger log) {
            try {
                if (Files.exists(file)) {
                    return Base64.getDecoder().decode(Files.readString(file).trim());
                }
                Files.createDirectories(file.getParent());
                byte[] key = SecureTokens.randomBytes(bytes);
                Files.writeString(file, Base64.getEncoder().encodeToString(key));
                try {
                    Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
                } catch (UnsupportedOperationException ignored) {
                    // non-POSIX filesystem
                }
                log.warn("DEV MODE: generated a local development secret at {}. Do not use in production.", file);
                return key;
            } catch (IOException e) {
                throw new IllegalStateException("Cannot read or create dev secret file " + file, e);
            }
        }
    }

    public static byte[] devSecret(DigiVoteProperties properties, String name, int bytes) {
        return DevSecretFile.loadOrCreate(Path.of(properties.localDir(), name), bytes, log);
    }
}
