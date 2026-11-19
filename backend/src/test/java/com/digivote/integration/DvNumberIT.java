package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** DV numbers: issued at registration/invitation, unique, usable as the sign-in identifier next to the email. */
class DvNumberIT extends IntegrationTestBase {

    @Test
    void everyAccountHasAUniqueDvNumberAndCanSignInWithIt() throws Exception {
        Scenario s = campaign();
        JsonNode me = getOk("/api/auth/me", s.voter1);
        String dv = me.get("dvNumber").asText();
        assertThat(dv).matches("^DV-\\d{4}-\\d{5,}$");

        // all accounts created by the scenario (owner, admin, candidates, voters, auditor) got different numbers
        assertThat(count("SELECT COUNT(*) FROM users WHERE dv_number IS NULL")).isZero();
        assertThat(count("SELECT COUNT(DISTINCT dv_number) FROM users")).isEqualTo(count("SELECT COUNT(*) FROM users"));

        JsonNode byDv = postOk("/api/auth/login", null, Map.of("dvNumber", dv, "password", PASSWORD));
        assertThat(byDv.get("user").get("email").asText()).isEqualTo(uniqueEmail("voter1", s.suffix));
        assertThat(byDv.get("user").get("dvNumber").asText()).isEqualTo(dv);

        // typing habits: lower case and surrounding spaces
        JsonNode typed = postOk("/api/auth/login", null, Map.of("dvNumber", "  " + dv.toLowerCase() + " ", "password", PASSWORD));
        assertThat(typed.get("user").get("id").asLong()).isEqualTo(me.get("id").asLong());

        // email sign-in still works
        postOk("/api/auth/login", null, Map.of("email", uniqueEmail("voter1", s.suffix), "password", PASSWORD));
    }

    @Test
    void wrongOrMissingIdentifiersAreRejectedGenerically() throws Exception {
        Scenario s = campaign();
        String dv = getOk("/api/auth/me", s.voter1).get("dvNumber").asText();

        Response wrongPw = postRaw("/api/auth/login", null, Map.of("dvNumber", dv, "password", "wrong-password-1"));
        assertThat(wrongPw.status()).isEqualTo(401);
        assertThat(wrongPw.body().get("message").asText()).isEqualTo("Invalid credentials");

        Response unknown = postRaw("/api/auth/login", null, Map.of("dvNumber", "DV-1999-99999", "password", PASSWORD));
        assertThat(unknown.status()).isEqualTo(401);
        assertThat(unknown.body().get("message").asText()).isEqualTo("Invalid credentials");

        Response none = postRaw("/api/auth/login", null, new HashMap<>(Map.of("password", PASSWORD)));
        assertThat(none.status()).isEqualTo(400);

        Response malformed = postRaw("/api/auth/login", null, Map.of("dvNumber", "owner@x.org", "password", PASSWORD));
        assertThat(malformed.status()).isEqualTo(400);
    }

    @Test
    void registrationReturnsTheNewOwnersDvNumber() throws Exception {
        String suffix = Long.toString(System.nanoTime(), 36);
        JsonNode session = postOk("/api/auth/register-organization", null, Map.of(
                "organizationName", "DV Org " + suffix, "fullName", "Owner " + suffix,
                "email", "dv." + suffix + "@it.digivote.test", "password", PASSWORD));
        assertThat(session.get("user").get("dvNumber").asText()).matches("^DV-\\d{4}-\\d{5,}$");
    }
}
