package com.digivote.integration;

import com.digivote.crypto.BlindRsa;
import com.digivote.crypto.CredentialKeyFingerprint;
import com.digivote.crypto.SecureTokens;
import com.fasterxml.jackson.databind.JsonNode;
import org.bouncycastle.crypto.params.RSAKeyParameters;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** P3: one canonical, publicly anchored credential-signing key per election. */
class KeyTransparencyIT extends IntegrationTestBase {

    @Test
    void publicAnchorMatchesTheKeyEveryVoterReceives() throws Exception {
        Scenario s = campaign();
        assertThat(getRaw("/api/public/elections/" + s.electionId + "/credential-key", null).status()).isEqualTo(404);
        transition(s, "VOTING");

        JsonNode anchor = getOk("/api/public/elections/" + s.electionId + "/credential-key", null); // no session
        String expected = CredentialKeyFingerprint.of(s.electionId, anchor.get("modulusHex").asText(),
                anchor.get("publicExponentHex").asText());
        assertThat(anchor.get("fingerprint").asText()).isEqualTo(expected);
        assertThat(anchor.get("version").asText()).isEqualTo("DIGI-VOTE-CREDENTIAL-KEY-v1");
        assertThat(anchor.get("electionId").asLong()).isEqualTo(s.electionId);
        assertThat(anchor.get("modulusBits").asInt()).isGreaterThanOrEqualTo(2048);
        assertThat(anchor.toString()).doesNotContainIgnoringCase("private").doesNotContain("\"d\"");

        for (String voter : List.of(s.voter1, s.voter2, s.candidates.get(0))) {
            JsonNode k = getOk("/api/elections/" + s.electionId + "/credential-key", voter);
            assertThat(k.get("fingerprint").asText()).isEqualTo(expected);
            assertThat(k.get("modulusHex").asText()).isEqualTo(anchor.get("modulusHex").asText());
        }
        // The fingerprint is also on the audit chain (written when the key was generated) and the public listing.
        String audited = jdbc.queryForObject("SELECT metadata_json FROM audit_logs WHERE election_id = ? "
                + "AND event_type = 'ELECTION_KEYS_GENERATED'", String.class, s.electionId);
        assertThat(json.readTree(audited).get("publicKeyFingerprintV1").asText()).isEqualTo(expected);
        assertThat(getOk("/api/public/elections", null).toString()).contains(expected);
    }

    @Test
    void keyIsStableAcrossTheLifecycleAndCannotBeSwapped() throws Exception {
        Scenario s = voting();
        String before = getOk("/api/public/elections/" + s.electionId + "/credential-key", null).get("fingerprint").asText();
        vote(s.voter1, s.electionId, 0);
        transition(s, "VERIFICATION");
        postOk("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
        transition(s, "PUBLISHED");
        assertThat(getOk("/api/public/elections/" + s.electionId + "/credential-key", null).get("fingerprint").asText())
                .isEqualTo(before);
        assertThatThrownBy(() -> jdbc.update("UPDATE election_keys SET rsa_modulus = 'ff' WHERE election_id = ?",
                s.electionId)).hasMessageContaining("election keys are immutable");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM election_keys WHERE election_id = ?", s.electionId))
                .hasMessageContaining("cannot be deleted");
    }

    @Test
    void concurrentCredentialRequestsAreAllSignedByThePublishedKey() throws Exception {
        Scenario s = voting();
        JsonNode anchor = getOk("/api/public/elections/" + s.electionId + "/credential-key", null);
        RSAKeyParameters pub = new RSAKeyParameters(false, new BigInteger(anchor.get("modulusHex").asText(), 16),
                new BigInteger(anchor.get("publicExponentHex").asText(), 16));
        List<String> voters = List.of(s.voter1, s.voter2, s.candidates.get(0), s.candidates.get(1), s.candidates.get(2));
        ExecutorService pool = Executors.newFixedThreadPool(voters.size());
        List<Future<Boolean>> results = new ArrayList<>();
        for (String voter : voters) {
            results.add(pool.submit(() -> {
                byte[] token = SecureTokens.randomBytes(32);
                BigInteger r = BlindRsa.randomBlindingFactor(pub.getModulus(), SecureTokens.random());
                BigInteger blinded = BlindRsa.blind(pub, BlindRsa.fullDomainHash(token, pub.getModulus()), r);
                JsonNode issued = postOk("/api/elections/" + s.electionId + "/credentials", voter,
                        Map.of("blindedMessageHex", blinded.toString(16)));
                BigInteger sig = BlindRsa.unblind(pub, new BigInteger(issued.get("blindSignatureHex").asText(), 16), r);
                return BlindRsa.verify(pub, token, sig);
            }));
        }
        for (Future<Boolean> f : results) {
            assertThat(f.get()).isTrue();
        }
        pool.shutdown();
        assertThat(count("SELECT COUNT(DISTINCT key_fingerprint) FROM voting_credentials WHERE election_id = ?", s.electionId))
                .isEqualTo(1);
    }

    @Test
    void fingerprintsAreElectionSpecific() throws Exception {
        Scenario a = voting();
        Scenario b = voting();
        String fa = getOk("/api/public/elections/" + a.electionId + "/credential-key", null).get("fingerprint").asText();
        String fb = getOk("/api/public/elections/" + b.electionId + "/credential-key", null).get("fingerprint").asText();
        assertThat(fa).isNotEqualTo(fb);
    }
}
