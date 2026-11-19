package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Admin-initiated password recovery: owner issues a one-time code, the member redeems it on the public endpoint. */
class RecoveryIT extends IntegrationTestBase {

    private long membershipId(Scenario s, String email) throws Exception {
        for (JsonNode m : getOk("/api/orgs/" + s.orgId + "/members?size=100", s.owner).get("content")) {
            if (email.equals(m.get("email").asText())) {
                return m.get("membershipId").asLong();
            }
        }
        throw new AssertionError("member not found: " + email);
    }

    private Response startRecovery(Scenario s, long membershipId, String token) throws Exception {
        return call(post("/api/orgs/" + s.orgId + "/members/" + membershipId + "/recovery"), token, null);
    }

    @Test
    void ownerIssuesACodeAndTheMemberSetsANewPassword() throws Exception {
        Scenario s = campaign();
        String email = uniqueEmail("voter1", s.suffix);
        Response started = startRecovery(s, membershipId(s, email), s.owner);
        assertThat(started.status()).isEqualTo(200);
        String code = started.body().get("recoveryCode").asText();
        assertThat(code).matches("^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$");
        // only a hash is stored
        assertThat(count("SELECT COUNT(*) FROM password_recovery_codes WHERE code_hash = ?",
                com.digivote.common.Hashing.sha256Hex(code.replace("-", "")))).isEqualTo(1);

        String newPassword = "Brand-New-Passw0rd";
        Response wrongCode = postRaw("/api/auth/recover", null, Map.of("email", email, "recoveryCode", "AAAA-BBBB-CCCC", "newPassword", newPassword));
        assertThat(wrongCode.status()).isEqualTo(400);
        assertThat(wrongCode.code()).isEqualTo("INVALID_RECOVERY");

        assertThat(call(post("/api/auth/recover"), null, Map.of("email", email, "recoveryCode", code.toLowerCase(), "newPassword", newPassword)).status())
                .isEqualTo(204);

        postOk("/api/auth/login", null, Map.of("email", email, "password", newPassword));
        assertThat(postRaw("/api/auth/login", null, Map.of("email", email, "password", PASSWORD)).status()).isEqualTo(401);

        // single use
        assertThat(postRaw("/api/auth/recover", null, Map.of("email", email, "recoveryCode", code, "newPassword", "Another-Passw0rd-2")).status())
                .isEqualTo(400);
    }

    @Test
    void recoveryHasGuardrails() throws Exception {
        Scenario s = campaign();
        long voter = membershipId(s, uniqueEmail("voter1", s.suffix));
        // members cannot issue codes, owners cannot be reset, and you cannot reset yourself
        assertThat(startRecovery(s, voter, s.voter2).status()).isIn(403, 404);
        long ownerMembership = membershipId(s, uniqueEmail("owner", s.suffix));
        assertThat(startRecovery(s, ownerMembership, s.owner).status()).isEqualTo(422);

        // repeated wrong codes lock the account like failed sign-ins
        String email = uniqueEmail("voter1", s.suffix);
        for (int i = 0; i < 5; i++) {
            postRaw("/api/auth/recover", null, Map.of("email", email, "recoveryCode", "AAAA-BBBB-CCCC", "newPassword", "Brand-New-Passw0rd"));
        }
        assertThat(postRaw("/api/auth/login", null, Map.of("email", email, "password", PASSWORD)).status()).isEqualTo(423);
        // unknown accounts look the same as wrong codes
        assertThat(postRaw("/api/auth/recover", null, Map.of("email", "nobody@it.digivote.test", "recoveryCode", "AAAA-BBBB-CCCC", "newPassword", "Brand-New-Passw0rd")).code())
                .isEqualTo("INVALID_RECOVERY");
    }
}
