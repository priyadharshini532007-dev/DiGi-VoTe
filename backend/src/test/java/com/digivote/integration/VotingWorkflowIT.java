package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

/** One-vote guarantee, credentials, ballots, receipts, bulletin board and results. */
class VotingWorkflowIT extends IntegrationTestBase {

    @Test
    void fullElectionLifecycleProducesConsistentResults() throws Exception {
        Scenario s = voting();
        JsonNode receipt = vote(s.voter1, s.electionId, 0);
        vote(s.voter2, s.electionId, 0);
        vote(s.candidates.get(1), s.electionId, 1);
        assertThat(receipt.get("receiptCode").asText()).matches("[0-9A-Z-]{25}");
        assertThat(receipt.get("qrPngDataUri").asText()).startsWith("data:image/png;base64,");
        assertThat(receipt.toString()).doesNotContain("@it.digivote.test");

        JsonNode recorded = getOk("/api/public/receipts/" + receipt.get("receiptCode").asText(), null);
        assertThat(recorded.get("status").asText()).isEqualTo("BALLOT_RECORDED");

        transition(s, "VERIFICATION");
        JsonNode result = postOk("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
        assertThat(result.get("acceptedBallots").asInt()).isEqualTo(3);
        assertThat(result.at("/items/0/label").asText()).isEqualTo("Candidate 0");
        assertThat(result.at("/items/0/votes").asInt()).isEqualTo(2);
        assertThat(result.at("/items/0/winner").asBoolean()).isTrue();
        // zero-vote candidate and NOTA are present with 0 votes
        assertThat(result.get("items")).hasSize(4);
        assertThat(result.at("/items/3/votes").asInt()).isZero();

        // repeated generation: identical hash, counter increments
        JsonNode again = postOk("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
        assertThat(again.get("resultHash").asText()).isEqualTo(result.get("resultHash").asText());
        assertThat(again.get("generationCount").asInt()).isEqualTo(2);

        // members other than operators cannot see unpublished results; public cannot either
        assertThat(getRaw("/api/elections/" + s.electionId + "/results", s.voter1).status()).isEqualTo(404);
        assertThat(getRaw("/api/public/elections/" + s.electionId + "/results", null).status()).isEqualTo(404);

        transition(s, "PUBLISHED");
        assertThat(getOk("/api/public/elections/" + s.electionId + "/results", null).get("status").asText())
                .isEqualTo("PUBLISHED");
        // published results cannot be modified
        Response regen = postRaw("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
        assertThat(regen.status()).isEqualTo(409);

        JsonNode included = getOk("/api/public/receipts/" + receipt.get("receiptCode").asText(), null);
        assertThat(included.get("status").asText()).isEqualTo("INCLUDED_IN_TALLY");

        JsonNode agg = getOk("/api/elections/" + s.electionId + "/integrity/aggregation", s.auditor);
        assertThat(agg.get("valid").asBoolean()).isTrue();
        assertThat(agg.get("ballotsChecked").asInt()).isEqualTo(3);

        transition(s, "ARCHIVED");
        JsonNode trust = getOk("/api/elections/" + s.electionId + "/trust", s.owner);
        assertThat(trust.get("overall").asText()).isIn("ALL_CHECKS_PASSED", "CHECKS_INCOMPLETE");
        assertThat(trust.toString()).doesNotContain("\"FAIL\"");
    }

    @Test
    void duplicateVoteIsRejectedAndSafeRetryReturnsTheSameReceipt() throws Exception {
        Scenario s = voting();
        Credential c = obtainCredential(s.voter1, s.electionId);
        String n = nonce();
        Response first = cast(s.electionId, c, List.of(0), n);
        assertThat(first.status()).isEqualTo(201);
        Response duplicate = cast(s.electionId, c, List.of(1), nonce());
        assertThat(duplicate.status()).isEqualTo(409);
        assertThat(duplicate.code()).isEqualTo("DUPLICATE_VOTE");
        Response retry = cast(s.electionId, c, List.of(0), n);
        assertThat(retry.status()).isEqualTo(201);
        assertThat(retry.body().get("replayed").asBoolean()).isTrue();
        assertThat(retry.body().get("receiptCode").asText()).isEqualTo(first.body().get("receiptCode").asText());
        assertThat(count("SELECT COUNT(*) FROM ballots WHERE election_id = ?", s.electionId)).isEqualTo(1);
        // a second credential for the same voter is refused
        Response second = postRaw("/api/elections/" + s.electionId + "/credentials", s.voter1,
                Map.of("blindedMessageHex", "abcdef"));
        assertThat(second.code()).isEqualTo("CREDENTIAL_ALREADY_ISSUED");
        assertThat(count("SELECT COUNT(*) FROM security_events WHERE event_type = 'DUPLICATE_BALLOT'")).isGreaterThan(0);
    }

    @Test
    void concurrentDuplicateSubmissionsAcceptExactlyOneBallot() throws Exception {
        Scenario s = voting();
        Credential c = obtainCredential(s.voter1, s.electionId);
        int threads = 6;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            final int option = i % 3;
            Callable<Integer> task = () -> {
                start.await();
                return cast(s.electionId, c, List.of(option), nonce()).status();
            };
            results.add(pool.submit(task));
        }
        start.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : results) {
            statuses.add(f.get());
        }
        pool.shutdown();
        assertThat(statuses.stream().filter(x -> x == 201)).hasSize(1);
        assertThat(statuses.stream().filter(x -> x == 409)).hasSize(threads - 1);
        assertThat(count("SELECT COUNT(*) FROM ballots WHERE election_id = ?", s.electionId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM voting_tokens WHERE election_id = ?", s.electionId)).isEqualTo(1);
        transition(s, "VERIFICATION");
        assertThat(count("SELECT COUNT(*) FROM bulletin_board_entries WHERE election_id = ?", s.electionId)).isEqualTo(1);
    }

    @Test
    void credentialExpiresWhenVotingCloses() throws Exception {
        Scenario s = voting();
        Credential c = obtainCredential(s.voter1, s.electionId);
        clock.advance(Duration.ofDays(2)); // past voting_end
        Response late = cast(s.electionId, c, List.of(0), nonce());
        assertThat(late.status()).isEqualTo(409);
        assertThat(late.code()).isEqualTo("CREDENTIAL_EXPIRED");
        clock.reset();
        transition(s, "VERIFICATION");
        Response afterClose = cast(s.electionId, c, List.of(0), nonce());
        assertThat(afterClose.code()).isEqualTo("CREDENTIAL_EXPIRED");
        assertThat(count("SELECT COUNT(*) FROM ballots WHERE election_id = ?", s.electionId)).isZero();
    }

    @Test
    void votingCannotOpenBeforeTheWindowAndCredentialsCannotBeIssued() throws Exception {
        Scenario s = campaign();
        java.time.Instant now = clock.instant();
        putOk("/api/elections/" + s.electionId + "/rules", s.admin, rules(now.plusSeconds(3600), now.plusSeconds(7200), true, 3));
        Response open = postRaw("/api/elections/" + s.electionId + "/transitions", s.admin, Map.of("target", "VOTING"));
        assertThat(open.status()).isEqualTo(422);
        assertThat(open.code()).isEqualTo("NOT_READY");
        Response cred = postRaw("/api/elections/" + s.electionId + "/credentials", s.voter1,
                Map.of("blindedMessageHex", "abcdef"));
        assertThat(cred.status()).isIn(403, 409);
        clock.advance(Duration.ofMinutes(61));
        assertThat(postRaw("/api/elections/" + s.electionId + "/transitions", s.admin, Map.of("target", "VOTING"))
                .status()).isEqualTo(200);
    }

    @Test
    void invalidCredentialAndInvalidSelectionsAreRejected() throws Exception {
        Scenario s = voting();
        Credential c = obtainCredential(s.voter1, s.electionId);
        Credential forged = new Credential(c.tokenHex(), new java.math.BigInteger(c.signatureHex(), 16)
                .add(java.math.BigInteger.ONE).toString(16));
        assertThat(cast(s.electionId, forged, List.of(0), nonce()).code()).isEqualTo("INVALID_CREDENTIAL");
        assertThat(cast(s.electionId, c, List.of(7), nonce()).code()).isEqualTo("INVALID_SELECTION");
        assertThat(cast(s.electionId, c, List.of(0, 1), nonce()).code()).isEqualTo("INVALID_SELECTION");
        assertThat(cast(s.electionId, c, List.of(), nonce()).status()).isEqualTo(400);
        assertThat(count("SELECT COUNT(*) FROM ballots WHERE election_id = ?", s.electionId)).isZero();
        // the credential is still usable after rejected attempts
        assertThat(cast(s.electionId, c, List.of(3), nonce()).status()).isEqualTo(201);
    }

    @Test
    void ballotSubmissionWithIdentityIsRefused() throws Exception {
        Scenario s = voting();
        Credential c = obtainCredential(s.voter1, s.electionId);
        Response r = postRaw("/api/public/elections/" + s.electionId + "/ballots", s.voter1, Map.of("tokenHex", c.tokenHex(),
                "signatureHex", c.signatureHex(), "selections", List.of(0), "submissionNonce", nonce()));
        assertThat(r.code()).isEqualTo("IDENTITY_NOT_ALLOWED");
    }

    @Test
    void failedBallotPersistenceLeavesNoPartialStateAndRetrySucceeds() throws Exception {
        Scenario s = voting();
        Credential c = obtainCredential(s.voter1, s.electionId);
        doThrow(new IllegalStateException("simulated storage failure")).when(receiptCodes).derive(anyLong(), anyString());
        try {
            Response failed = cast(s.electionId, c, List.of(0), nonce());
            assertThat(failed.status()).isEqualTo(500);
        } finally {
            reset(receiptCodes);
        }
        assertThat(count("SELECT COUNT(*) FROM ballots WHERE election_id = ?", s.electionId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM votes v JOIN ballots b ON b.id = v.ballot_id WHERE b.election_id = ?",
                s.electionId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM voting_tokens WHERE election_id = ?", s.electionId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM bulletin_board_entries WHERE election_id = ?", s.electionId)).isZero();
        assertThat(cast(s.electionId, c, List.of(0), nonce()).status()).isEqualTo(201);
    }

    @Test
    void electionWithZeroBallotsProducesNoWinner() throws Exception {
        Scenario s = voting();
        transition(s, "VERIFICATION");
        JsonNode result = postOk("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
        assertThat(result.get("acceptedBallots").asInt()).isZero();
        assertThat(result.get("explanation").asText()).contains("No ballots");
        for (JsonNode item : result.get("items")) {
            assertThat(item.get("votes").asInt()).isZero();
            assertThat(item.get("winner").asBoolean()).isFalse();
        }
    }

    @Test
    void receiptVerificationOutcomes() throws Exception {
        assertThat(getOk("/api/public/receipts/not-a-code", null).get("status").asText()).isEqualTo("INVALID_RECEIPT");
        // well-formed code with a valid check character that was never issued
        String body = "00000000000000000000";
        String code = com.digivote.voting.ReceiptCodes.format(body + com.digivote.crypto.SecureTokens.checkCharacter(body));
        assertThat(getOk("/api/public/receipts/" + code, null).get("status").asText()).isEqualTo("RECEIPT_NOT_FOUND");
    }

    @Test
    void auditChainRecordsTheElectionAndDetectsCorruption() throws Exception {
        Scenario s = voting();
        vote(s.voter1, s.electionId, 0);
        JsonNode ok = postOk("/api/orgs/" + s.orgId + "/audit-logs/verify", s.auditor, null);
        assertThat(ok.get("valid").asBoolean()).isTrue();
        String meta = jdbc.queryForObject("SELECT GROUP_CONCAT(metadata_json) FROM audit_logs WHERE chain_key = ?",
                String.class, "ORG-" + s.orgId);
        assertThat(meta).doesNotContain(PASSWORD).doesNotContainIgnoringCase("tokenHex").doesNotContain("selections");
        // forge a record appended out of band (UPDATE/DELETE are blocked by triggers)
        long last = count("SELECT MAX(seq) FROM audit_logs WHERE chain_key = ?", "ORG-" + s.orgId);
        jdbc.update("INSERT INTO audit_logs (chain_key, seq, event_id, event_type, occurred_at, metadata_json, prev_hash, "
                + "record_hash) VALUES (?, ?, UUID(), 'FORGED', NOW(3), '{}', REPEAT('a',64), REPEAT('b',64))",
                "ORG-" + s.orgId, last + 1000);
        JsonNode broken = getOk("/api/elections/" + s.electionId + "/trust", s.owner);
        assertThat(broken.get("overall").asText()).isEqualTo("INTEGRITY_PROBLEMS");
        JsonNode bad = postRaw("/api/orgs/" + s.orgId + "/audit-logs/verify", s.auditor, null).body();
        assertThat(bad.get("valid").asBoolean()).isFalse();
        assertThat(bad.get("firstInvalidSeq").asLong()).isEqualTo(last + 1000);
    }
}
