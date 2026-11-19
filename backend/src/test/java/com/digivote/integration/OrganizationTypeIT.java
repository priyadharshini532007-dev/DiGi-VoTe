package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The organization type chosen at registration is stored and returned with the session. */
class OrganizationTypeIT extends IntegrationTestBase {

    private Map<String, Object> body(String suffix, String type) {
        Map<String, Object> m = new HashMap<>(Map.of("organizationName", "Type Org " + suffix, "fullName", "Owner " + suffix,
                "email", "type." + suffix + "@it.digivote.test", "password", PASSWORD));
        if (type != null) {
            m.put("organizationType", type);
        }
        return m;
    }

    @Test
    void typeIsStoredAndReturned() throws Exception {
        String suffix = Long.toString(System.nanoTime(), 36);
        JsonNode session = postOk("/api/auth/register-organization", null, body(suffix, "NGO"));
        assertThat(session.get("user").get("memberships").get(0).get("organizationType").asText()).isEqualTo("NGO");
        long orgId = session.get("user").get("memberships").get(0).get("organizationId").asLong();
        assertThat(getOk("/api/orgs/" + orgId, session.get("token").asText()).get("type").asText()).isEqualTo("NGO");
    }

    @Test
    void typeIsOptionalAndValidated() throws Exception {
        String suffix = Long.toString(System.nanoTime(), 36);
        JsonNode session = postOk("/api/auth/register-organization", null, body(suffix, null));
        assertThat(session.get("user").get("memberships").get(0).has("organizationType")).isFalse();
        assertThat(postRaw("/api/auth/register-organization", null, body(suffix + "x", "SPACESHIP")).status()).isEqualTo(400);
    }
}
