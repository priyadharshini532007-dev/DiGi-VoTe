package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Organization contact details and the per-organization security policy (lockout, session length, mixed case). */
class OrganizationPolicyIT extends IntegrationTestBase {

    @Test
    void contactDetailsRoundTrip() throws Exception {
        Scenario s = campaign();
        Map<String, Object> body = new HashMap<>(Map.of("name", "Contact Org", "description", "d", "primaryColor", "#0b1f4d",
                "contactEmail", "elections@example.org", "phone", "+91 98765 43210", "tagline", "Fair elections"));
        JsonNode updated = ok(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/orgs/" + s.orgId), s.owner, body);
        assertThat(updated.get("contactEmail").asText()).isEqualTo("elections@example.org");
        assertThat(getOk("/api/orgs/" + s.orgId, s.voter1).get("tagline").asText()).isEqualTo("Fair elections");
        body.put("phone", "call me");
        assertThat(call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/orgs/" + s.orgId), s.owner, body).status())
                .isEqualTo(400);
    }

    @Test
    void policyIsEnforcedAtSignInAndPasswordChange() throws Exception {
        Scenario s = campaign();
        JsonNode policy = putOk("/api/orgs/" + s.orgId + "/security-policy", s.owner, Map.of("passwordMinLength", 10,
                "maxFailedLogins", 3, "lockoutMinutes", 5, "sessionMinutes", 15, "requireMixedCase", true));
        assertThat(policy.get("sessionMinutes").asInt()).isEqualTo(15);

        // session length follows the policy
        String email = uniqueEmail("voter1", s.suffix);
        JsonNode session = postOk("/api/auth/login", null, Map.of("email", email, "password", PASSWORD));
        long minutes = Duration.between(Instant.now(), Instant.parse(session.get("expiresAt").asText())).toMinutes();
        assertThat(minutes).isBetween(13L, 15L);

        // mixed-case rule applies to password changes
        assertThat(postRaw("/api/auth/change-password", s.voter1, Map.of("currentPassword", PASSWORD, "newPassword", "alllowercase123")).status())
                .isEqualTo(400);

        // lockout after 3 failures lasts 5 minutes
        for (int i = 0; i < 3; i++) {
            postRaw("/api/auth/login", null, Map.of("email", email, "password", "wrong-password-1"));
        }
        assertThat(postRaw("/api/auth/login", null, Map.of("email", email, "password", PASSWORD)).status()).isEqualTo(423);
        clock.advance(Duration.ofMinutes(6));
        assertThat(postRaw("/api/auth/login", null, Map.of("email", email, "password", PASSWORD)).status()).isEqualTo(200);
    }

    @Test
    void oldClientsThatSendOnlyTheTwoOriginalFieldsStillWork() throws Exception {
        Scenario s = campaign();
        JsonNode policy = putOk("/api/orgs/" + s.orgId + "/security-policy", s.owner, Map.of("passwordMinLength", 12, "maxFailedLogins", 4));
        assertThat(policy.get("passwordMinLength").asInt()).isEqualTo(12);
        assertThat(policy.get("lockoutMinutes").asInt()).isEqualTo(15);
    }
}
