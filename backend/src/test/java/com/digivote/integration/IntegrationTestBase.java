package com.digivote.integration;

import com.digivote.crypto.BlindRsa;
import com.digivote.crypto.SecureTokens;
import com.digivote.voting.ReceiptCodes;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.bouncycastle.crypto.params.RSAKeyParameters;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import com.digivote.firebase.FirebaseAuthGateway;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Shared Spring context for MySQL-backed integration tests. Skipped (not failed) when the test
 * database is unreachable, so the unit suite still runs on machines without MySQL.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("it")
@Import(IntegrationTestBase.Config.class)
public abstract class IntegrationTestBase {

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock();
        }

        /** Fresh schema for every test run (test database only). */
        @Bean
        FlywayMigrationStrategy cleanMigrate() {
            return (Flyway flyway) -> {
                flyway.clean();
                flyway.migrate();
            };
        }
    }

    @Autowired
    protected MockMvc mvc;
    @Autowired
    protected ObjectMapper json;
    @Autowired
    protected JdbcTemplate jdbc;
    @Autowired
    protected MutableClock clock;
    @MockitoSpyBean
    protected ReceiptCodes receiptCodes;
    @MockitoBean
    protected FirebaseAuthGateway firebaseGateway;

    @BeforeAll
    static void requireDatabase() {
        Properties env = new Properties();
        try {
            Path file = Path.of("..", ".env");
            if (Files.exists(file)) {
                try (var in = Files.newInputStream(file)) {
                    env.load(in);
                }
            }
        } catch (Exception ignored) {
            // fall through to environment variables
        }
        String url = System.getenv().getOrDefault("TEST_DB_URL", env.getProperty("TEST_DB_URL",
                "jdbc:mysql://127.0.0.1:3307/digivote_test"));
        String user = System.getenv().getOrDefault("DB_USERNAME", env.getProperty("DB_USERNAME", "digivote"));
        String pass = System.getenv().getOrDefault("DB_PASSWORD", env.getProperty("DB_PASSWORD", ""));
        boolean available;
        try (Connection c = DriverManager.getConnection(url + "?connectTimeout=2000", user, pass)) {
            available = c.isValid(2);
        } catch (Exception e) {
            available = false;
        }
        Assumptions.assumeTrue(available, "MySQL test database not reachable at " + url + "; integration tests skipped");
    }

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    // ------------------------------------------------------------------ HTTP helpers

    protected record Response(int status, JsonNode body) {
        public String code() {
            return body == null || body.get("code") == null ? null : body.get("code").asText();
        }
    }

    protected Response call(MockHttpServletRequestBuilder req, String token, Object body) throws Exception {
        if (token != null) {
            req.header("Authorization", "Bearer " + token);
        }
        if (body != null) {
            req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body));
        }
        MvcResult r = mvc.perform(req).andReturn();
        String text = r.getResponse().getContentAsString();
        return new Response(r.getResponse().getStatus(), text.isBlank() ? null : json.readTree(text));
    }

    protected JsonNode ok(MockHttpServletRequestBuilder req, String token, Object body) throws Exception {
        Response r = call(req, token, body);
        assertThat(r.status()).as("HTTP status for %s: %s", req, r.body()).isBetween(200, 299);
        return r.body();
    }

    protected JsonNode getOk(String path, String token) throws Exception {
        return ok(get(path), token, null);
    }

    protected JsonNode postOk(String path, String token, Object body) throws Exception {
        return ok(post(path), token, body);
    }

    protected JsonNode putOk(String path, String token, Object body) throws Exception {
        return ok(put(path), token, body);
    }

    protected Response postRaw(String path, String token, Object body) throws Exception {
        return call(post(path), token, body);
    }

    protected Response getRaw(String path, String token) throws Exception {
        return call(get(path), token, null);
    }

    protected Response putRaw(String path, String token, Object body) throws Exception {
        return call(put(path), token, body);
    }

    protected Response deleteRaw(String path, String token) throws Exception {
        return call(delete(path), token, null);
    }

    // ------------------------------------------------------------------ scenario builder

    protected static final String PASSWORD = "TestPassw0rd-" + SecureTokens.randomBase32(6);

    protected static class Scenario {
        public long orgId;
        public long electionId;
        public String owner;
        public String admin;
        public long adminUserId;
        public List<String> candidates = new ArrayList<>();
        public List<Long> candidateIds = new ArrayList<>();
        public String voter1;
        public String voter2;
        public String auditor;
        public String suffix;
    }

    protected String uniqueEmail(String role, String suffix) {
        return role + "." + suffix + "@it.digivote.test";
    }

    protected JsonNode invite(long orgId, String ownerToken, String role, String email) throws Exception {
        JsonNode inv = postOk("/api/orgs/" + orgId + "/members", ownerToken,
                Map.of("email", email, "fullName", role + " Person", "role", role));
        return postOk("/api/auth/activate", null, Map.of("email", email,
                "activationCode", inv.get("activationCode").asText(), "fullName", role + " Person", "password", PASSWORD));
    }

    protected Map<String, Object> rules(Instant votingStart, Instant votingEnd, boolean nota, int minCandidates) {
        Map<String, Object> r = new java.util.HashMap<>();
        r.put("maxSelections", 1);
        r.put("countingMethod", "PLURALITY");
        r.put("requireCandidateApproval", true);
        r.put("anonymousVoting", true);
        r.put("publicResults", true);
        r.put("qrReceipts", true);
        r.put("receiptsRequired", true);
        r.put("notaEnabled", nota);
        r.put("candidatesMayVote", true);
        r.put("administratorsMayVote", false);
        r.put("resultPublicationPolicy", "MANUAL");
        r.put("minCandidates", minCandidates);
        r.put("campaignStart", votingStart.minusSeconds(60).toString());
        r.put("campaignEnd", votingStart.toString());
        r.put("votingStart", votingStart.toString());
        r.put("votingEnd", votingEnd.toString());
        r.put("withdrawalDeadline", votingStart.toString());
        return r;
    }

    /** Organization with every role, an election with three approved candidates, moved to CAMPAIGN. */
    protected Scenario campaign() throws Exception {
        Scenario s = new Scenario();
        s.suffix = SecureTokens.randomBase32(8).toLowerCase();
        JsonNode reg = postOk("/api/auth/register-organization", null, Map.of("organizationName", "IT Org " + s.suffix,
                "fullName", "Owner", "email", uniqueEmail("owner", s.suffix), "password", PASSWORD));
        s.owner = reg.get("token").asText();
        s.orgId = reg.at("/user/memberships/0/organizationId").asLong();
        JsonNode admin = invite(s.orgId, s.owner, "ELECTION_ADMIN", uniqueEmail("admin", s.suffix));
        s.admin = admin.get("token").asText();
        s.adminUserId = admin.at("/user/id").asLong();
        for (int i = 0; i < 3; i++) {
            s.candidates.add(invite(s.orgId, s.owner, "CANDIDATE", uniqueEmail("cand" + i, s.suffix)).get("token").asText());
        }
        s.voter1 = invite(s.orgId, s.owner, "VOTER", uniqueEmail("voter1", s.suffix)).get("token").asText();
        s.voter2 = invite(s.orgId, s.owner, "VOTER", uniqueEmail("voter2", s.suffix)).get("token").asText();
        s.auditor = invite(s.orgId, s.owner, "AUDITOR", uniqueEmail("auditor", s.suffix)).get("token").asText();

        s.electionId = postOk("/api/orgs/" + s.orgId + "/elections", s.admin,
                Map.of("title", "IT Election " + s.suffix)).get("id").asLong();
        Instant now = clock.instant();
        putOk("/api/elections/" + s.electionId + "/rules", s.admin, rules(now, now.plusSeconds(86400), true, 3));
        postOk("/api/elections/" + s.electionId + "/voters/add-all-members", s.admin, null);
        transition(s, "REGISTRATION");
        for (int i = 0; i < 3; i++) {
            JsonNode app = postOk("/api/elections/" + s.electionId + "/applications", s.candidates.get(i),
                    Map.of("displayName", "Candidate " + i, "statement", "Statement " + i));
            JsonNode reviewed = postOk("/api/applications/" + app.get("id").asLong() + "/review", s.admin,
                    Map.of("decision", "APPROVE"));
            s.candidateIds.add(reviewed.get("candidateId").asLong());
        }
        transition(s, "CAMPAIGN");
        return s;
    }

    protected Scenario voting() throws Exception {
        Scenario s = campaign();
        transition(s, "VOTING");
        return s;
    }

    protected JsonNode transition(Scenario s, String target) throws Exception {
        return postOk("/api/elections/" + s.electionId + "/transitions", s.admin, Map.of("target", target));
    }

    // ------------------------------------------------------------------ voter-side protocol (mirrors the browser)

    protected record Credential(String tokenHex, String signatureHex) {
    }

    protected Credential obtainCredential(String voterToken, long electionId) throws Exception {
        JsonNode key = getOk("/api/elections/" + electionId + "/credential-key", voterToken);
        RSAKeyParameters pub = new RSAKeyParameters(false, new BigInteger(key.get("modulusHex").asText(), 16),
                new BigInteger(key.get("publicExponentHex").asText(), 16));
        byte[] token = SecureTokens.randomBytes(32);
        BigInteger r = BlindRsa.randomBlindingFactor(pub.getModulus(), SecureTokens.random());
        BigInteger blinded = BlindRsa.blind(pub, BlindRsa.fullDomainHash(token, pub.getModulus()), r);
        JsonNode issued = postOk("/api/elections/" + electionId + "/credentials", voterToken,
                Map.of("blindedMessageHex", blinded.toString(16)));
        BigInteger sig = BlindRsa.unblind(pub, new BigInteger(issued.get("blindSignatureHex").asText(), 16), r);
        assertThat(BlindRsa.verify(pub, token, sig)).isTrue();
        return new Credential(HexFormat.of().formatHex(token), sig.toString(16));
    }

    protected Response cast(long electionId, Credential c, List<Integer> selections, String nonce) throws Exception {
        return postRaw("/api/public/elections/" + electionId + "/ballots", null, Map.of("tokenHex", c.tokenHex(),
                "signatureHex", c.signatureHex(), "selections", selections, "submissionNonce", nonce));
    }

    protected static String nonce() {
        return HexFormat.of().formatHex(SecureTokens.randomBytes(16));
    }

    protected JsonNode vote(String voterToken, long electionId, int option) throws Exception {
        Response r = cast(electionId, obtainCredential(voterToken, electionId), List.of(option), nonce());
        assertThat(r.status()).as("ballot accepted: %s", r.body()).isEqualTo(201);
        return r.body();
    }

    protected long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }
}
