package com.digivote.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Typed DIGI-VOTE configuration. Every secret is supplied through environment variables;
 * see .env.example for the full list.
 */
@ConfigurationProperties(prefix = "digivote")
public record DigiVoteProperties(
        boolean devMode,
        String localDir,
        String publicBaseUrl,
        List<String> corsOrigins,
        Security security,
        Crypto crypto,
        Storage storage,
        Firebase firebase,
        Anonymity anonymity) {

    public record Security(String jwtSecret, long jwtTtlMinutes, String masterKey, int activationTtlHours) {
    }

    public record Crypto(int rsaBits, int paillierBits) {
    }

    public record Storage(String provider, long maxUploadBytes) {
    }

    /**
     * @param bulletinBatchSize accepted ballots are appended to the public bulletin board in shuffled batches of at
     *                          least this many (the remainder is published, shuffled, when voting closes)
     */
    public record Anonymity(int bulletinBatchSize) {
        public Anonymity {
            if (bulletinBatchSize < 2) {
                throw new IllegalArgumentException("digivote.anonymity.bulletin-batch-size must be at least 2");
            }
        }
    }

    public record Firebase(boolean enabled, String projectId, String credentialsPath, String storageBucket,
                           boolean appCheckEnabled, String projectNumber) {
    }
}
