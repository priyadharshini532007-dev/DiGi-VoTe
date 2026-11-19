package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/** Authentication, authorization, tenant isolation, IDOR and sensitive-data checks. */
class SecurityIT extends IntegrationTestBase {

    @Test
    void invalidOrMissingTokensAreRejected() throws Exception {
        assertThat(getRaw("/api/auth/me", null).status()).isEqualTo(401);
        assertThat(getRaw("/api/auth/me", "not-a-jwt").status()).isEqualTo(401);
        String forged = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiaXNzIjoiZGlnaS12b3RlIn0.c2lnbmF0dXJl";
        assertThat(getRaw("/api/auth/me", forged).status()).isEqualTo(401);
        assertThat(count("SELECT COUNT(*) FROM security_events WHERE event_type = 'INVALID_TOKEN'")).isGreaterThan(0);
    }

    @Test
    void wrongPasswordsLockTheAccount() throws Exception {
        Scenario s = campaign();
        String email = uniqueEmail("voter1", s.suffix);
        for (int i = 0; i < 5; i++) {
            assertThat(postRaw("/api/auth/login", null, Map.of("email", email, "password", "wrong-password-1")).status())
                    .isEqualTo(401);
        }
        Response locked = postRaw("/api/auth/login", null, Map.of("email", email, "password", PASSWORD));
        assertThat(locked.status()).isEqualTo(423);
        assertThat(count("SELECT COUNT(*) FROM security_events WHERE event_type = 'ACCOUNT_LOCKED' AND organization_id = ?",
                s.orgId)).isEqualTo(1);
        // unknown accounts get the same generic answer
        Response unknown = postRaw("/api/auth/login", null, Map.of("email", "nobody@it.digivote.test", "password", "x"));
        assertThat(unknown.status()).isEqualTo(401);
        assertThat(unknown.body().get("message").asText()).isEqualTo("Invalid credentials");
    }

    @Test
    void rolesCannotPerformOtherRolesActions() throws Exception {
        Scenario s = campaign();
        // voter cannot create elections, approve candidates, or manage members
        assertThat(postRaw("/api/orgs/" + s.orgId + "/elections", s.voter1, Map.of("title", "x")).status()).isEqualTo(403);
        assertThat(postRaw("/api/orgs/" + s.orgId + "/members", s.voter1,
                Map.of("email", "z@it.digivote.test", "fullName", "Z", "role", "VOTER")).status()).isEqualTo(403);
        // election administrator cannot manage organization membership or settings
        assertThat(postRaw("/api/orgs/" + s.orgId + "/members", s.admin,
                Map.of("email", "z@it.digivote.test", "fullName", "Z", "role", "VOTER")).status()).isEqualTo(403);
        assertThat(putRaw("/api/orgs/" + s.orgId, s.admin, Map.of("name", "x", "primaryColor", "#000000")).status())
                .isEqualTo(403);
        // candidate cannot review applications or change state
        assertThat(postRaw("/api/elections/" + s.electionId + "/transitions", s.candidates.get(0),
                Map.of("target", "VOTING")).status()).isEqualTo(403);
        // auditor is read-only
        assertThat(postRaw("/api/elections/" + s.electionId + "/transitions", s.auditor, Map.of("target", "VOTING"))
                .status()).isEqualTo(403);
        assertThat(putRaw("/api/elections/" + s.electionId + "/rules", s.auditor,
                rules(clock.instant(), clock.instant().plusSeconds(3600), true, 3)).status()).isEqualTo(403);
        assertThat(getRaw("/api/elections/" + s.electionId + "/readiness", s.auditor).status()).isEqualTo(200);
        // voter cannot list other voters or applications (identity data)
        assertThat(getRaw("/api/elections/" + s.electionId + "/voters", s.voter1).status()).isEqualTo(403);
        assertThat(getRaw("/api/elections/" + s.electionId + "/applications", s.voter1).status()).isEqualTo(403);
        assertThat(count("SELECT COUNT(*) FROM security_events WHERE event_type = 'AUTHORIZATION_DENIED' "
                + "AND organization_id = ?", s.orgId)).isGreaterThanOrEqualTo(8);
    }

    @Test
    void organizationsAreIsolated() throws Exception {
        Scenario a = campaign();
        Scenario b = campaign();
        assertThat(getRaw("/api/elections/" + a.electionId, b.owner).status()).isEqualTo(404);
        assertThat(getRaw("/api/orgs/" + a.orgId + "/members", b.owner).status()).isEqualTo(404);
        assertThat(getRaw("/api/orgs/" + a.orgId + "/audit-logs", b.auditor).status()).isEqualTo(404);
        assertThat(postRaw("/api/elections/" + a.electionId + "/transitions", b.admin, Map.of("target", "VOTING"))
                .status()).isEqualTo(404);
        assertThat(getRaw("/api/candidates/" + a.candidateIds.get(0), b.voter1).status()).isEqualTo(404);
        assertThat(count("SELECT COUNT(*) FROM security_events WHERE event_type = 'CROSS_ORG_ACCESS'")).isGreaterThan(0);
    }

    @Test
    void usersCannotTouchOtherUsersResources() throws Exception {
        Scenario s = campaign();
        long otherCandidate = s.candidateIds.get(1);
        Response edit = putRaw("/api/candidates/" + otherCandidate + "/manifesto", s.candidates.get(0),
                Map.of("vision", "hijack"));
        assertThat(edit.status()).isEqualTo(403);
        JsonNode apps = getOk("/api/me/applications", s.candidates.get(1));
        long otherApp = apps.get(0).get("id").asLong();
        assertThat(postRaw("/api/applications/" + otherApp + "/withdraw", s.candidates.get(0), null).status()).isEqualTo(404);
        assertThat(postRaw("/api/applications/" + otherApp + "/withdraw", s.voter1, null).status()).isEqualTo(404);
        // notifications of another user cannot be marked read (silently ignored, no data returned)
        assertThat(getOk("/api/me/notifications", s.voter1).toString()).doesNotContain("Application approved");
    }

    @Test
    void invalidRulesAndTransitionsAreRejected() throws Exception {
        Scenario s = campaign();
        Map<String, Object> bad = rules(clock.instant(), clock.instant().plusSeconds(3600), false, 1);
        Response r = putRaw("/api/elections/" + s.electionId + "/rules", s.admin, bad);
        assertThat(r.status()).isEqualTo(422);
        assertThat(r.code()).isEqualTo("INVALID_RULES");
        Response skip = postRaw("/api/elections/" + s.electionId + "/transitions", s.admin, Map.of("target", "PUBLISHED"));
        assertThat(skip.status()).isEqualTo(409);
        assertThat(skip.code()).isEqualTo("INVALID_TRANSITION");
    }

    @Test
    void manifestoFreezesWhenVotingOpens() throws Exception {
        Scenario s = campaign();
        long cid = s.candidateIds.get(0);
        putOk("/api/candidates/" + cid + "/manifesto", s.candidates.get(0), Map.of("vision", "v1"));
        postOk("/api/candidates/" + cid + "/manifesto/publish", s.candidates.get(0), null);
        transition(s, "VOTING");
        Response frozen = putRaw("/api/candidates/" + cid + "/manifesto", s.candidates.get(0), Map.of("vision", "v2"));
        assertThat(frozen.status()).isEqualTo(422);
        assertThat(frozen.code()).isEqualTo("MANIFESTO_FROZEN");
        assertThat(getOk("/api/candidates/" + cid, s.voter1).at("/manifesto/vision").asText()).isEqualTo("v1");
        assertThat(getOk("/api/candidates/" + cid, s.voter1).at("/manifesto/frozen").asBoolean()).isTrue();
    }

    @Test
    void maliciousUploadsAreRejectedAndRecorded() throws Exception {
        Scenario s = campaign();
        long cid = s.candidateIds.get(0);
        MockMultipartFile evil = new MockMultipartFile("file", "photo.png", "image/png",
                "<html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8));
        var res = mvc.perform(multipart("/api/candidates/" + cid + "/media").file(evil).param("type", "PHOTO")
                .header("Authorization", "Bearer " + s.candidates.get(0))).andReturn();
        assertThat(res.getResponse().getStatus()).isEqualTo(400);
        assertThat(count("SELECT COUNT(*) FROM security_events WHERE event_type = 'UPLOAD_REJECTED' AND organization_id = ?",
                s.orgId)).isEqualTo(1);
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
        var okRes = mvc.perform(multipart("/api/candidates/" + cid + "/media")
                .file(new MockMultipartFile("file", "../../etc/passwd.png", "image/png", png)).param("type", "PHOTO")
                .header("Authorization", "Bearer " + s.candidates.get(0))).andReturn();
        assertThat(okRes.getResponse().getStatus()).isEqualTo(201);
        JsonNode media = json.readTree(okRes.getResponse().getContentAsString());
        assertThat(media.get("originalFilename").asText()).doesNotContain("/");
    }

    @Test
    void responsesNeverExposeSecrets() throws Exception {
        Scenario s = voting();
        vote(s.voter1, s.electionId, 0);
        List<String> bodies = List.of(
                getOk("/api/auth/me", s.owner).toString(),
                getOk("/api/orgs/" + s.orgId + "/members", s.owner).toString(),
                getOk("/api/elections/" + s.electionId, s.admin).toString(),
                getOk("/api/elections/" + s.electionId + "/credential-key", s.voter1).toString(),
                getOk("/api/elections/" + s.electionId + "/voters", s.admin).toString(),
                getOk("/api/public/elections/" + s.electionId + "/bulletin", null).toString(),
                getOk("/api/orgs/" + s.orgId + "/audit-logs", s.auditor).toString());
        for (String body : bodies) {
            assertThat(body).doesNotContainIgnoringCase("passwordHash").doesNotContainIgnoringCase("password_hash")
                    .doesNotContain("$2a$").doesNotContainIgnoringCase("private").doesNotContain("lambda")
                    .doesNotContain(PASSWORD).doesNotContainIgnoringCase("activationCodeHash");
        }
        String bulletin = bodies.get(5);
        assertThat(bulletin).doesNotContain("@it.digivote.test");
        String sealed = jdbc.queryForObject("SELECT rsa_private_enc FROM election_keys WHERE election_id = ?",
                String.class, s.electionId);
        String modulus = jdbc.queryForObject("SELECT rsa_modulus FROM election_keys WHERE election_id = ?",
                String.class, s.electionId);
        assertThat(sealed).doesNotContain(modulus.substring(0, 32));
    }
}
