package com.digivote.candidate.storage;

import com.digivote.common.ApiException;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;

/**
 * Decorator pattern: adds upload validation to any {@link MediaStorage} without changing it.
 * The declared content type must be on the allow-list for the media kind AND the file's leading
 * bytes (magic number) must match that type, so renamed HTML/SVG/script files are rejected.
 */
public class ValidatingMediaStorage implements MediaStorage {

    public enum Kind { IMAGE, PDF, VIDEO }

    private static final Map<String, byte[]> SIGNATURES = Map.of(
            "image/png", new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A},
            "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF},
            "application/pdf", new byte[]{'%', 'P', 'D', 'F', '-'});

    private static final Map<Kind, Set<String>> ALLOWED = Map.of(
            Kind.IMAGE, Set.of("image/png", "image/jpeg"),
            Kind.PDF, Set.of("application/pdf"),
            Kind.VIDEO, Set.of("video/mp4"));

    private final MediaStorage delegate;
    private final long maxBytes;

    public ValidatingMediaStorage(MediaStorage delegate, long maxBytes) {
        this.delegate = delegate;
        this.maxBytes = maxBytes;
    }

    /** @return the verified content type */
    public String validate(Kind kind, String declaredContentType, byte[] content) {
        if (content == null || content.length == 0) {
            throw ApiException.badRequest("EMPTY_UPLOAD", "The uploaded file is empty");
        }
        if (content.length > maxBytes) {
            throw ApiException.badRequest("UPLOAD_TOO_LARGE", "The uploaded file exceeds " + (maxBytes / 1048576) + " MB");
        }
        String type = declaredContentType == null ? "" : declaredContentType.toLowerCase().split(";")[0].trim();
        if (!ALLOWED.get(kind).contains(type) || !matchesSignature(type, content)) {
            throw ApiException.badRequest("UNSUPPORTED_MEDIA",
                    "File content does not match an allowed type for " + kind.name().toLowerCase());
        }
        return type;
    }

    private static boolean matchesSignature(String type, byte[] content) {
        if ("video/mp4".equals(type)) {
            return content.length > 12 && content[4] == 'f' && content[5] == 't' && content[6] == 'y' && content[7] == 'p';
        }
        byte[] sig = SIGNATURES.get(type);
        return sig != null && content.length >= sig.length && Arrays.equals(Arrays.copyOf(content, sig.length), sig);
    }

    @Override
    public StoredObject store(String key, byte[] content, String contentType) {
        return delegate.store(key, content, contentType);
    }

    @Override
    public byte[] load(String key) {
        return delegate.load(key);
    }

    @Override
    public String provider() {
        return delegate.provider();
    }
}
