package com.digivote.integration;

import com.digivote.verification.BulletinBoardService;
import com.digivote.voting.BallotTransaction;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ballot submission racing the VOTING -> VERIFICATION transition, against MySQL with the real transactions and
 * row locks. Both paths take the per-election lock (the election_keys row) before the election row; ballots also
 * touch the election row through foreign keys, so closing in the opposite order deadlocked and lost ballots.
 *
 * <p>The deterministic tests hold the election_keys row from a separate connection, queue the competing
 * transactions behind it (observed in the processlist, not by sleeping), then release it. The repeated test
 * fires ballots, credential requests and the close together.
 */
class ClosureRaceIT extends IntegrationTestBase {

    private static final int VOTERS = 5;
    private static final String KEY_LOCK_SQL = "%from election_keys%for update%";

    @Autowired
    private DataSource dataSource;
    @Autowired
    private BulletinBoardService bulletin;

    private record Ballot(Credential credential, String nonce) {
    }

    private record Outcome(int status, String code, JsonNode body) {
    }

    // ------------------------------------------------------------------ helpers

    /** Election in VOTING with {@code voters} extra eligible voters; returns their session tokens. */
    private List<String> votingElection(Scenario s, int voters) throws Exception {
        List<String> tokens = new ArrayList<>();
        List<String> emails = new ArrayList<>();
        for (int i = 0; i < voters; i++) {
            String email = uniqueEmail("race" + i, s.suffix);
            tokens.add(invite(s.orgId, s.owner, "VOTER", email).get("token").asText());
            emails.add(email);
        }
        if (!emails.isEmpty()) {
            postOk("/api/elections/" + s.electionId + "/voters", s.admin, Map.of("emails", emails));
        }
        transition(s, "VOTING");
        return tokens;
    }

    private Outcome submit(Scenario s, Ballot b, int option) throws Exception {
        Response r = cast(s.electionId, b.credential(), List.of(option), b.nonce());
        return new Outcome(r.status(), r.code(), r.body());
    }

    private Outcome close(Scenario s) throws Exception {
        Response r = postRaw("/api/elections/" + s.electionId + "/transitions", s.admin, Map.of("target", "VERIFICATION"));
        return new Outcome(r.status(), r.code(), r.body());
    }

    /** Number of other connections currently waiting for (or executing) the election_keys row lock. */
    private long waitingForKeyLock(long blockerConnectionId) {
        return count("SELECT COUNT(*) FROM information_schema.processlist WHERE id <> ? AND id <> CONNECTION_ID() "
                + "AND LOWER(info) LIKE ?",
                blockerConnectionId, KEY_LOCK_SQL);
    }

    private void awaitWaiters(long blockerConnectionId, long expected) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        while (waitingForKeyLock(blockerConnectionId) < expected) {
            assertThat(System.nanoTime()).as("transactions queued on the election_keys lock").isLessThan(deadline);
            Thread.sleep(20);
        }
    }

    /** Requests a credential like the browser does; returns the HTTP status (refused once voting has closed). */
    private int issueCredentialStatus(String voterToken, long electionId) throws Exception {
        Response keyResponse = getRaw("/api/elections/" + electionId + "/credential-key", voterToken);
        if (keyResponse.status() != 200) {
            return keyResponse.status();
        }
        JsonNode key = keyResponse.body();
        var pub = new org.bouncycastle.crypto.params.RSAKeyParameters(false,
                new java.math.BigInteger(key.get("modulusHex").asText(), 16),
                new java.math.BigInteger(key.get("publicExponentHex").asText(), 16));
        byte[] token = com.digivote.crypto.SecureTokens.randomBytes(32);
        var r = com.digivote.crypto.BlindRsa.randomBlindingFactor(pub.getModulus(), com.digivote.crypto.SecureTokens.random());
        var blinded = com.digivote.crypto.BlindRsa.blind(pub,
                com.digivote.crypto.BlindRsa.fullDomainHash(token, pub.getModulus()), r);
        return postRaw("/api/elections/" + electionId + "/credentials", voterToken,
                Map.of("blindedMessageHex", blinded.toString(16))).status();
    }

    private String tokenHash(Scenario s, Credential c) {
        return BallotTransaction.tokenHash(s.electionId, HexFormat.of().parseHex(c.tokenHex()));
    }

    /**
     * Invariants after a race: every response is either an accepted ballot or a clean rejection; every accepted
     * ballot has its token record, receipt and exactly one bulletin entry; rejected ballots left nothing behind;
     * nothing new is accepted after close (exact retries replay the receipt); the tally and the bulletin board agree.
     */
    private void assertConsistent(Scenario s, List<Ballot> ballots, List<Outcome> outcomes, Outcome close)
            throws Exception {
        assertThat(close.status()).as("close: %s", close.body()).isEqualTo(200);
        int accepted = 0;
        for (int i = 0; i < ballots.size(); i++) {
            Outcome o = outcomes.get(i);
            Ballot b = ballots.get(i);
            long tokenRows = count("SELECT COUNT(*) FROM voting_tokens WHERE election_id = ? AND token_hash = ?",
                    s.electionId, tokenHash(s, b.credential()));
            if (o.status() == 201) {
                accepted++;
                assertThat(tokenRows).as("token record of accepted ballot").isEqualTo(1);
                String code = o.body().get("receiptCode").asText();
                JsonNode receipt = getOk("/api/public/receipts/" + code, null);
                // INCLUDED_IN_TALLY when results were already generated during the race.
                assertThat(receipt.get("status").asText()).as("receipt after close")
                        .isIn("BALLOT_RECORDED", "INCLUDED_IN_TALLY");
                assertThat(o.body().get("ballotCommitment").asText()).isEqualTo(receipt.get("ballotCommitment").asText());
                // After close an exact retry (same credential and nonce) still returns the stored receipt, so a
                // response lost in the closing race can be recovered; a different nonce is refused. Nothing is stored.
                Outcome retry = submit(s, b, 0);
                assertThat(retry.status()).as("exact retry after close: %s", retry.body()).isEqualTo(201);
                assertThat(retry.body().get("replayed").asBoolean()).isTrue();
                assertThat(retry.body().get("receiptCode").asText()).isEqualTo(code);
                assertThat(retry.body().get("status").asText()).isEqualTo("BALLOT_RECORDED");
                assertThat(submit(s, new Ballot(b.credential(), nonce()), 0).code()).as("new nonce after close")
                        .isEqualTo("CREDENTIAL_EXPIRED");
            } else {
                assertThat(o.status()).as("rejected ballot: %s", o.body()).isEqualTo(409);
                assertThat(o.code()).isEqualTo("CREDENTIAL_EXPIRED");
                assertThat(tokenRows).as("rejected ballot left a token record").isZero();
                assertThat(submit(s, b, 0).code()).as("no ballot after close").isEqualTo("CREDENTIAL_EXPIRED");
            }
        }
        long id = s.electionId;
        assertThat(count("SELECT COUNT(*) FROM ballots WHERE election_id = ?", id)).isEqualTo(accepted);
        assertThat(count("SELECT COUNT(*) FROM voting_tokens WHERE election_id = ?", id)).isEqualTo(accepted);
        assertThat(count("SELECT COUNT(*) FROM verification_receipts WHERE election_id = ?", id)).isEqualTo(accepted);
        assertThat(count("SELECT COUNT(*) FROM votes v JOIN ballots b ON b.id = v.ballot_id WHERE b.election_id = ?", id))
                .as("one ciphertext per option (3 candidates + NOTA)").isEqualTo(accepted * 4L);
        assertThat(count("SELECT COUNT(*) FROM bulletin_board_entries WHERE election_id = ?", id)).isEqualTo(accepted);
        assertThat(count("SELECT COUNT(DISTINCT ballot_id) FROM bulletin_board_entries WHERE election_id = ?", id))
                .isEqualTo(accepted);
        assertThat(count("SELECT COUNT(*) FROM ballots b LEFT JOIN bulletin_board_entries e ON e.ballot_id = b.id "
                + "WHERE b.election_id = ? AND e.id IS NULL", id)).as("accepted ballots left unpublished").isZero();
        assertThat(bulletin.verify(id).valid()).as("bulletin hash chain").isTrue();

        JsonNode result = postOk("/api/elections/" + id + "/results/generate", s.admin, null);
        assertThat(result.get("acceptedBallots").asInt()).isEqualTo(accepted);
        int tallied = 0;
        for (JsonNode item : result.get("items")) {
            tallied += item.get("votes").asInt();
        }
        assertThat(tallied).as("one selection per ballot").isEqualTo(accepted);
    }

    // ------------------------------------------------------------------ tests

    /**
     * Ballots queue on the per-election lock first, then the close. With the old lock order the close held the
     * election row while waiting, and the first ballot to get the lock deadlocked on its foreign-key check.
     */
    @Test
    void ballotsQueuedBeforeCloseAreAcceptedOrCleanlyRejected() throws Exception {
        race(true);
    }

    /** The close queues on the per-election lock first, then ballots; ballots that wait must be refused cleanly. */
    @Test
    void closeQueuedBeforeBallotsRejectsTheWaitingBallots() throws Exception {
        race(false);
    }

    private void race(boolean ballotsFirst) throws Exception {
        Scenario s = campaign();
        List<String> voters = votingElection(s, VOTERS);
        List<Ballot> ballots = new ArrayList<>();
        for (String v : voters) {
            ballots.add(new Ballot(obtainCredential(v, s.electionId), nonce()));
        }
        // Two ballots already accepted and pending publication (batch size 3 in tests): the close must publish them.
        Outcome early1 = submit(s, ballots.get(0), 0);
        Outcome early2 = submit(s, ballots.get(1), 1);
        assertThat(early1.status()).isEqualTo(201);
        assertThat(early2.status()).isEqualTo(201);
        assertThat(postRaw("/api/elections/" + s.electionId + "/results/generate", s.admin, null).status())
                .as("results while ballots are unpublished").isEqualTo(409);

        ExecutorService pool = Executors.newFixedThreadPool(VOTERS + 1);
        try (Connection blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            long blockerId;
            try (PreparedStatement ps = blocker.prepareStatement("SELECT CONNECTION_ID()");
                 var rs = ps.executeQuery()) {
                rs.next();
                blockerId = rs.getLong(1);
            }
            try (PreparedStatement ps = blocker.prepareStatement(
                    "SELECT election_id FROM election_keys WHERE election_id = ? FOR UPDATE")) {
                ps.setLong(1, s.electionId);
                ps.executeQuery().close();
            }
            List<Ballot> racing = ballots.subList(2, ballots.size());
            List<Future<Outcome>> casts = new ArrayList<>();
            Future<Outcome> closing = null;
            if (!ballotsFirst) {
                closing = pool.submit(() -> close(s));
                awaitWaiters(blockerId, 1);
            }
            for (int i = 0; i < racing.size(); i++) {
                Ballot b = racing.get(i);
                int option = i % 3;
                casts.add(pool.submit(() -> submit(s, b, option)));
            }
            awaitWaiters(blockerId, ballotsFirst ? racing.size() : racing.size() + 1);
            if (ballotsFirst) {
                closing = pool.submit(() -> close(s));
                awaitWaiters(blockerId, racing.size() + 1);
            }
            blocker.commit(); // release: the queued transactions now compete for the lock

            List<Outcome> outcomes = new ArrayList<>(List.of(early1, early2));
            for (Future<Outcome> f : casts) {
                outcomes.add(f.get(60, TimeUnit.SECONDS));
            }
            Outcome closed = closing.get(60, TimeUnit.SECONDS);
            if (!ballotsFirst) {
                for (Outcome o : outcomes.subList(2, outcomes.size())) {
                    assertThat(o.code()).as("ballot queued behind the close: %s", o.body()).isEqualTo("CREDENTIAL_EXPIRED");
                }
            }
            assertConsistent(s, ballots, outcomes, closed);
        } finally {
            pool.shutdownNow();
        }
    }

    /**
     * Final-batch publication for every pending count (batch size 3 in tests): none, fewer than a batch, exactly one
     * full batch, and several full batches followed by a small final batch. Also checks receipts before and after
     * close and that repeated or invalid transitions are refused without publishing anything again.
     */
    @Test
    void finalBatchPublishesEveryPendingBallotForAnyCount() throws Exception {
        int[][] cases = {{0, 0, 0}, {2, 0, 2}, {3, 3, 0}, {7, 6, 1}};   // ballots, published during voting, at close
        for (int[] c : cases) {
            int n = c[0];
            Scenario s = campaign();
            List<String> voters = votingElection(s, n);
            List<String> receipts = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                Outcome o = submit(s, new Ballot(obtainCredential(voters.get(i), s.electionId), nonce()), i % 3);
                assertThat(o.status()).isEqualTo(201);
                receipts.add(o.body().get("receiptCode").asText());
            }
            long id = s.electionId;
            assertThat(count("SELECT COUNT(*) FROM bulletin_board_entries WHERE election_id = ?", id))
                    .as("published during voting (%d ballots)", n).isEqualTo(c[1]);
            int recognized = 0;
            for (String code : receipts) {
                String status = getOk("/api/public/receipts/" + code, null).get("status").asText();
                assertThat(status).isIn("RECEIPT_RECOGNIZED", "BALLOT_RECORDED");
                recognized += status.equals("RECEIPT_RECOGNIZED") ? 1 : 0;
            }
            assertThat(recognized).as("receipts awaiting publication").isEqualTo(c[2]);

            assertThat(close(s).status()).isEqualTo(200);
            Outcome again = close(s);
            assertThat(again.status()).as("repeated close").isEqualTo(409);
            assertThat(again.code()).isEqualTo("INVALID_TRANSITION");
            Response reopen = postRaw("/api/elections/" + id + "/transitions", s.admin, Map.of("target", "VOTING"));
            assertThat(reopen.code()).as("reopen voting").isEqualTo("INVALID_TRANSITION");

            assertThat(count("SELECT COUNT(*) FROM bulletin_board_entries WHERE election_id = ?", id)).isEqualTo(n);
            assertThat(count("SELECT COUNT(DISTINCT ballot_id) FROM bulletin_board_entries WHERE election_id = ?", id))
                    .isEqualTo(n);
            assertThat(bulletin.verify(id).valid()).isTrue();
            List<String> closeEvents = jdbc.queryForList("SELECT metadata_json FROM audit_logs WHERE election_id = ? "
                    + "AND event_type = 'BALLOTS_PUBLISHED' AND metadata_json LIKE '%voting-closed%'", String.class, id);
            assertThat(closeEvents).as("one final-batch event").hasSize(1);
            assertThat(json.readTree(closeEvents.get(0)).get("published").asInt()).isEqualTo(c[2]);
            assertThat(json.readTree(closeEvents.get(0)).get("totalOnBoard").asInt()).isEqualTo(n);
            for (String code : receipts) {
                assertThat(getOk("/api/public/receipts/" + code, null).get("status").asText()).isEqualTo("BALLOT_RECORDED");
            }
            JsonNode result = postOk("/api/elections/" + id + "/results/generate", s.admin, null);
            assertThat(result.get("acceptedBallots").asInt()).isEqualTo(n);
            transition(s, "PUBLISHED");
            for (String code : receipts) {
                assertThat(getOk("/api/public/receipts/" + code, null).get("status").asText()).isEqualTo("INCLUDED_IN_TALLY");
            }
        }
    }

    /**
     * Repeated free-running race: ballots, credential requests by other voters and the close start together.
     * Any deadlock surfaces as a 500 and fails the invariants.
     */
    @Test
    void repeatedConcurrentBallotsAndCloseStayConsistent() throws Exception {
        int accepted = 0;
        int rejected = 0;
        int generatedDuringRace = 0;
        for (int round = 0; round < 10; round++) {
            java.util.Random timing = new java.util.Random(round); // reproducible start offsets per round
            Scenario s = campaign();
            List<String> voters = votingElection(s, VOTERS + 2);
            List<Ballot> ballots = new ArrayList<>();
            for (String v : voters.subList(0, VOTERS)) {
                ballots.add(new Ballot(obtainCredential(v, s.electionId), nonce()));
            }
            ExecutorService pool = Executors.newFixedThreadPool(VOTERS + 3);
            try {
                CountDownLatch start = new CountDownLatch(1);
                List<Future<Outcome>> casts = new ArrayList<>();
                for (int i = 0; i < ballots.size(); i++) {
                    Ballot b = ballots.get(i);
                    int option = i % 3;
                    int delayMillis = timing.nextInt(40);
                    casts.add(pool.submit(() -> {
                        start.await();
                        TimeUnit.MILLISECONDS.sleep(delayMillis);
                        return submit(s, b, option);
                    }));
                }
                List<Future<Integer>> issuance = new ArrayList<>();
                for (String v : voters.subList(VOTERS, voters.size())) {
                    issuance.add(pool.submit(() -> {
                        start.await();
                        return issueCredentialStatus(v, s.electionId);
                    }));
                }
                int closeDelayMillis = timing.nextInt(40); // the close lands anywhere among the ballots
                Future<Outcome> closing = pool.submit(() -> {
                    start.await();
                    TimeUnit.MILLISECONDS.sleep(closeDelayMillis);
                    return close(s);
                });
                int generateDelayMillis = timing.nextInt(60); // result generation racing the close
                Future<Response> generating = pool.submit(() -> {
                    start.await();
                    TimeUnit.MILLISECONDS.sleep(generateDelayMillis);
                    return postRaw("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
                });
                start.countDown();
                List<Outcome> outcomes = new ArrayList<>();
                for (Future<Outcome> f : casts) {
                    Outcome o = f.get(60, TimeUnit.SECONDS);
                    assertThat(o.status()).as("round %d ballot: %s", round, o.body()).isNotEqualTo(500);
                    outcomes.add(o);
                }
                for (Future<Integer> f : issuance) {
                    assertThat(f.get(60, TimeUnit.SECONDS)).isNotEqualTo(500);
                }
                Response generated = generating.get(60, TimeUnit.SECONDS);
                long acceptedThisRound = outcomes.stream().filter(o -> o.status() == 201).count();
                if (generated.status() == 200) {
                    generatedDuringRace++;
                    assertThat(generated.body().get("acceptedBallots").asLong()).as("results generated during the race")
                            .isEqualTo(acceptedThisRound);
                } else {
                    assertThat(generated.status()).as("generate before close: %s", generated.body()).isEqualTo(409);
                }
                assertConsistent(s, ballots, outcomes, closing.get(60, TimeUnit.SECONDS));
                for (Outcome o : outcomes) {
                    if (o.status() == 201) {
                        accepted++;
                    } else {
                        rejected++;
                    }
                }
            } finally {
                pool.shutdownNow();
            }
        }
        System.out.println("[ClosureRaceIT] repeated race: " + accepted + " accepted, " + rejected + " cleanly rejected, results generated during "
                + generatedDuringRace + " of 10 races");
    }
}
