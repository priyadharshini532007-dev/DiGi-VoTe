package com.digivote.candidate.storage;

import com.digivote.common.Hashing;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Development storage under .local/media (git-ignored). */
public class LocalMediaStorage implements MediaStorage {

    private final Path root;

    public LocalMediaStorage(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    @Override
    public StoredObject store(String key, byte[] content, String contentType) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, content);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store media", e);
        }
        return new StoredObject(provider(), key, Hashing.sha256Hex(content), content.length);
    }

    @Override
    public byte[] load(String key) {
        try {
            return Files.readAllBytes(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read media", e);
        }
    }

    @Override
    public String provider() {
        return "LOCAL";
    }

    private Path resolve(String key) {
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root)) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        return p;
    }
}
