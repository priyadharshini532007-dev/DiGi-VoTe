package com.digivote.candidate.storage;

import com.digivote.config.DigiVoteProperties;
import com.google.firebase.FirebaseApp;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Path;

@Configuration
public class StorageConfig {

    @Bean
    public ValidatingMediaStorage mediaStorage(DigiVoteProperties properties, ObjectProvider<FirebaseApp> firebase) {
        MediaStorage base;
        if ("firebase".equalsIgnoreCase(properties.storage().provider())) {
            FirebaseApp app = firebase.getIfAvailable();
            if (app == null) {
                throw new IllegalStateException("DIGIVOTE_STORAGE_PROVIDER=firebase requires FIREBASE_ENABLED=true");
            }
            base = new FirebaseMediaStorage(app);
        } else {
            base = new LocalMediaStorage(Path.of(properties.localDir(), "media"));
        }
        return new ValidatingMediaStorage(base, properties.storage().maxUploadBytes());
    }
}
