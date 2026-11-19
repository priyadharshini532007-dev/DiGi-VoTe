package com.digivote.candidate.storage;

import com.digivote.common.Hashing;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.Bucket;
import com.google.firebase.FirebaseApp;
import com.google.firebase.cloud.StorageClient;

/** Firebase Cloud Storage backend (enabled with DIGIVOTE_STORAGE_PROVIDER=firebase and FIREBASE_ENABLED=true). */
public class FirebaseMediaStorage implements MediaStorage {

    private final FirebaseApp app;

    public FirebaseMediaStorage(FirebaseApp app) {
        this.app = app;
    }

    @Override
    public StoredObject store(String key, byte[] content, String contentType) {
        Bucket bucket = StorageClient.getInstance(app).bucket();
        bucket.create(key, content, contentType);
        return new StoredObject(provider(), key, Hashing.sha256Hex(content), content.length);
    }

    @Override
    public byte[] load(String key) {
        Blob blob = StorageClient.getInstance(app).bucket().get(key);
        if (blob == null) {
            throw new IllegalStateException("Media object missing from storage");
        }
        return blob.getContent();
    }

    @Override
    public String provider() {
        return "FIREBASE";
    }
}
