package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/** Voter self sign-up: DV number, sealed identity data, roles limited to Voter/Candidate, no auto-enrolment. */
class SignupIT extends IntegrationTestBase {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};

    @BeforeEach
    void signupOrganizationExists() throws Exception {
        if (count("SELECT COUNT(*) FROM organizations WHERE slug = 'it-signup-org'") == 0) {
            postOk("/api/auth/register-organization", null, Map.of("organizationName", "it-signup-org",
                    "fullName", "Signup Owner", "email", "owner." + System.nanoTime() + "@it.digivote.test", "password", PASSWORD));
        }
    }

    private Map<String, Object> data(String suffix) {
        Map<String, Object> m = new HashMap<>();
        m.put("role", "VOTER");
        m.put("fullName", "Ravi Kumar");
        m.put("gender", "Male");
        m.put("dateOfBirth", "1995-04-12");
        m.put("fatherName", "Suresh Kumar");
        m.put("motherName", "Latha Kumar");
        m.put("email", "signup." + suffix + "@it.digivote.test");
        m.put("mobileNumber", "9" + String.format("%09d", Math.abs(suffix.hashCode()) % 1_000_000_000L));
        m.put("address", "12 Lake Road, Chennai, Tamil Nadu");
        m.put("idType", "VOTER_ID");
        m.put("idNumber", "ABC" + String.format("%07d", Math.abs(suffix.hashCode()) % 10_000_000L));
        m.put("password", PASSWORD);
        return m;
    }

    private Response signup(Map<String, Object> data, byte[] proof, String proofType) throws Exception {
        var req = multipart("/api/auth/signup")
                .file(new MockMultipartFile("data", "", MediaType.APPLICATION_JSON_VALUE, json.writeValueAsBytes(data)))
                .file(new MockMultipartFile("proof", "id.png", proofType, proof));
        var r = mvc.perform(req).andReturn().getResponse();
        String text = r.getContentAsString();
        return new Response(r.getStatus(), text.isBlank() ? null : json.readTree(text));
    }

    @Test
    void voterSignsUpGetsDvNumberAndCanLogIn() throws Exception {
        String suffix = Long.toString(System.nanoTime(), 36);
        Response r = signup(data(suffix), PNG, "image/png");
        assertThat(r.status()).isEqualTo(201);
        JsonNode user = r.body().get("user");
        assertThat(user.get("dvNumber").asText()).matches("^DV-\\d{4}-\\d{5,}$");
        assertThat(user.get("memberships").get(0).get("role").asText()).isEqualTo("VOTER");

        // can sign in with the DV number
        postOk("/api/auth/login", null, Map.of("dvNumber", user.get("dvNumber").asText(), "password", PASSWORD));

        // identity details are stored sealed, never in clear, and the proof is ciphertext
        long uid = user.get("id").asLong();
        String sealed = jdbc.queryForObject("SELECT id_number_sealed FROM identity_profiles WHERE user_id = ?", String.class, uid);
        assertThat(sealed).doesNotContain("ABC");
        assertThat(count("SELECT COUNT(*) FROM identity_profiles WHERE user_id = ? AND id_number_hash REGEXP '^[0-9a-f]{64}$'", uid)).isEqualTo(1);
        // nothing in the API response carries identity data
        assertThat(r.body().toString()).doesNotContain("ABC").doesNotContain("Suresh");
        // signing up does not put anyone on a voter list
        assertThat(count("SELECT COUNT(*) FROM eligible_voters WHERE user_id = ?", uid)).isZero();
    }

    @Test
    void duplicatesAndWeakInputAreRejectedPerField() throws Exception {
        String suffix = Long.toString(System.nanoTime(), 36);
        Map<String, Object> d = data(suffix);
        assertThat(signup(d, PNG, "image/png").status()).isEqualTo(201);

        Map<String, Object> dupEmail = data(suffix + "b"); dupEmail.put("email", d.get("email"));
        Response e = signup(dupEmail, PNG, "image/png");
        assertThat(e.status()).isEqualTo(409);
        assertThat(e.body().get("fieldErrors").get(0).get("field").asText()).isEqualTo("email");

        Map<String, Object> dupId = data(suffix + "c"); dupId.put("idNumber", d.get("idNumber"));
        assertThat(signup(dupId, PNG, "image/png").body().get("fieldErrors").get(0).get("field").asText()).isEqualTo("idNumber");

        Map<String, Object> minor = data(suffix + "d"); minor.put("dateOfBirth", java.time.LocalDate.now().minusYears(10).toString());
        assertThat(signup(minor, PNG, "image/png").body().get("fieldErrors").get(0).get("field").asText()).isEqualTo("dateOfBirth");

        Map<String, Object> badId = data(suffix + "e"); badId.put("idNumber", "123");
        assertThat(signup(badId, PNG, "image/png").body().get("fieldErrors").get(0).get("field").asText()).isEqualTo("idNumber");

        Response html = signup(data(suffix + "f"), "<html><script>1</script></html>".getBytes(StandardCharsets.UTF_8), "image/png");
        assertThat(html.status()).isEqualTo(400);
        assertThat(html.body().get("fieldErrors").get(0).get("field").asText()).isEqualTo("proof");
    }

    @Test
    void privilegedRolesCannotBeChosen() throws Exception {
        for (String role : new String[]{"ORG_OWNER", "ELECTION_ADMIN", "AUDITOR"}) {
            Map<String, Object> d = data(Long.toString(System.nanoTime(), 36)); d.put("role", role);
            assertThat(signup(d, PNG, "image/png").status()).as(role).isEqualTo(400);
        }
    }
}
