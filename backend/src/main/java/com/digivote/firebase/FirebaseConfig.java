package com.digivote.firebase;

import com.digivote.config.DigiVoteProperties;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Initializes the Firebase Admin SDK only when FIREBASE_ENABLED=true. Credentials come from the file
 * named by GOOGLE_APPLICATION_CREDENTIALS (never committed) or from the runtime's default credentials.
 */
@Configuration
@ConditionalOnProperty(prefix = "digivote.firebase", name = "enabled", havingValue = "true")
public class FirebaseConfig {

    @Bean
    public FirebaseApp firebaseApp(DigiVoteProperties properties) throws IOException {
        DigiVoteProperties.Firebase cfg = properties.firebase();
        GoogleCredentials credentials;
        if (cfg.credentialsPath() != null && !cfg.credentialsPath().isBlank()) {
            try (InputStream in = new FileInputStream(cfg.credentialsPath())) {
                credentials = GoogleCredentials.fromStream(in);
            }
        } else {
            credentials = GoogleCredentials.getApplicationDefault();
        }
        FirebaseOptions.Builder options = FirebaseOptions.builder().setCredentials(credentials);
        if (cfg.projectId() != null && !cfg.projectId().isBlank()) {
            options.setProjectId(cfg.projectId());
        }
        if (cfg.storageBucket() != null && !cfg.storageBucket().isBlank()) {
            options.setStorageBucket(cfg.storageBucket());
        }
        return FirebaseApp.getApps().isEmpty() ? FirebaseApp.initializeApp(options.build()) : FirebaseApp.getInstance();
    }
}
