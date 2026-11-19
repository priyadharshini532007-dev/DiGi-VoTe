package com.digivote.candidate.storage;

/** Abstraction over where candidate media bytes live (local disk in development, Firebase Cloud Storage in cloud). */
public interface MediaStorage {

    StoredObject store(String key, byte[] content, String contentType);

    byte[] load(String key);

    String provider();

    record StoredObject(String provider, String key, String sha256, long size) {
    }
}
