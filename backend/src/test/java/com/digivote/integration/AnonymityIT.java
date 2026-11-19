package com.digivote.integration;

import com.digivote.voting.BallotTransaction;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Reproduces the voter-to-ballot correlation attack found in the cryptography audit and checks that it no
 * longer works. The attacker is an owner/administrator/auditor who can read the organization's audit log
 * through the API and, more strongly, every row of the database (ids, sequence numbers, timestamps).
 *
 * <p>The test knows the ground truth (which voter cast which ballot) only because it holds each voter's token;
 * the attacker does not. Attacks are scored against that truth across several event interleavings.
 */
class AnonymityIT extends IntegrationTestBase {

    private static final int VOTERS = 8;

    private record Voter(long userId, String token) {
    }

    private record Run(Scenario s, Map<Long, Long> truth) {   // userId -> ballotId
    }

    // ------------------------------------------------------------------ the attacks

    /** Original attack: a CREDENTIAL_ISSUED event followed by a per-ballot event names the ballot. */
    private Map<Long, Long> auditAdjacencyAttack(Scenario s) throws Exception {
        List<JsonNode> events = new ArrayList<>();
        for (int page = 0; ; page++) {
            JsonNode p = getOk("/api/orgs/" + s.orgId + "/audit-logs?size=100&page=" + page, s.auditor);
            p.get("content").forEach(events::add);
            if (page + 1 >= p.get("totalPages").asInt()) {
                break;
            }
        }
        events.sort((a, b) -> Long.compare(a.get("seq").asLong(), b.get("seq").asLong()));
        Map<Long, Long> guess = new HashMap<>();
        for (int i = 0; i + 1 < events.size(); i++) {
            JsonNode e = events.get(i);
            JsonNode next = events.get(i + 1);
            if ("CREDENTIAL_ISSUED".equals(e.get("eventType").asText()) && e.get("actorRef") != null
                    && next.get("metadataJson").asText().contains("bulletinSeq")) {
                int seq = json.readTree(next.get("metadataJson").asText()).get("bulletinSeq").asInt();
                Long ballot = jdbc.queryForObject("SELECT ballot_id FROM bulletin_board_entries WHERE election_id = ? AND seq = ?",
                        Long.class, s.electionId, seq);
                guess.put(Long.parseLong(e.get("actorRef").asText().replace("user:", "")), ballot);
            }
        }
        return guess;
    }

    /** Pair the k-th credential issued (identity side) with the k-th ballot in some anonymous-side ordering. */
    private Map<Long, Long> orderingAttack(Scenario s, String ballotOrderSql) {
        List<Long> users = jdbc.queryForList("SELECT ev.user_id FROM voting_credentials c JOIN eligible_voters ev "
                + "ON ev.id = c.eligible_voter_id WHERE c.election_id = ? ORDER BY c.id", Long.class, s.electionId);
        List<Long> ballots = jdbc.queryForList(ballotOrderSql, Long.class, s.electionId);
        Map<Long, Long> guess = new HashMap<>();
        for (int i = 0; i < Math.min(users.size(), ballots.size()); i++) {
            guess.put(users.get(i), ballots.get(i));
        }
        return guess;
    }

    private static final Map<String, String> ORDERINGS = new LinkedHashMap<>();

    static {
        ORDERINGS.put("ballots.id", "SELECT id FROM ballots WHERE election_id = ? ORDER BY id");
        ORDERINGS.put("votes.id", "SELECT v.ballot_id FROM votes v JOIN ballots b ON b.id = v.ballot_id "
                + "WHERE b.election_id = ? AND v.option_index = 0 ORDER BY v.id");
        ORDERINGS.put("voting_tokens.id", "SELECT ballot_id FROM voting_tokens WHERE election_id = ? ORDER BY id");
        ORDERINGS.put("verification_receipts.id", "SELECT ballot_id FROM verification_receipts WHERE election_id = ? ORDER BY id");
        ORDERINGS.put("bulletin seq", "SELECT ballot_id FROM bulletin_board_entries WHERE election_id = ? ORDER BY seq");
    }

    private static int correct(Map<Long, Long> guess, Map<Long, Long> truth) {
        int c = 0;
        for (var e : guess.entrySet()) {
            if (e.getValue().equals(truth.get(e.getKey()))) {
                c++;
            }
        }
        return c;
    }

    // ------------------------------------------------------------------ scenarios

    private Run election(String order) throws Exception {
        Scenario s = campaign();
        List<Voter> voters = new ArrayList<>();
        List<String> emails = new ArrayList<>();
        for (int i = 0; i < VOTERS; i++) {
            String email = uniqueEmail("anon" + i, s.suffix);
            JsonNode act = invite(s.orgId, s.owner, "VOTER", email);
            voters.add(new Voter(act.at("/user/id").asLong(), act.get("token").asText()));
            emails.add(email);
        }
        postOk("/api/elections/" + s.electionId + "/voters", s.admin, Map.of("emails", emails));
        transition(s, "VOTING");

        Map<Long, Long> truth = new HashMap<>();
        Map<Long, Credential> creds = new HashMap<>();
        switch (order) {
            case "issue-then-vote-each" -> {
                for (Voter v : voters) {
                    Credential c = obtainCredential(v.token(), s.electionId);
                    assertThat(cast(s.electionId, c, List.of(voters.indexOf(v) % 4), nonce()).status()).isEqualTo(201);
                    creds.put(v.userId(), c);
                }
            }
            case "issue-all-vote-reverse", "issue-all-vote-random", "concurrent" -> {
                for (Voter v : voters) {
                    creds.put(v.userId(), obtainCredential(v.token(), s.electionId));
                }
                List<Voter> castOrder = new ArrayList<>(voters);
                if (order.equals("issue-all-vote-reverse")) {
                    Collections.reverse(castOrder);
                } else {
                    Collections.shuffle(castOrder, new Random());
                }
                if (order.equals("concurrent")) {
                    ExecutorService pool = Executors.newFixedThreadPool(VOTERS);
                    List<Future<Integer>> futures = new ArrayList<>();
                    for (Voter v : castOrder) {
                        futures.add(pool.submit(() -> cast(s.electionId, creds.get(v.userId()), List.of(1), nonce()).status()));
                    }
                    for (Future<Integer> f : futures) {
                        assertThat(f.get()).isEqualTo(201);
                    }
                    pool.shutdown();
                } else {
                    for (Voter v : castOrder) {
                        assertThat(cast(s.electionId, creds.get(v.userId()), List.of(0), nonce()).status()).isEqualTo(201);
                    }
                }
            }
            default -> throw new IllegalArgumentException(order);
        }
        for (var e : creds.entrySet()) {
            String hash = BallotTransaction.tokenHash(s.electionId, HexFormat.of().parseHex(e.getValue().tokenHex()));
            truth.put(e.getKey(), jdbc.queryForObject("SELECT ballot_id FROM voting_tokens WHERE election_id = ? AND token_hash = ?",
                    Long.class, s.electionId, hash));
        }
        transition(s, "VERIFICATION"); // publishes the final shuffled batch
        assertThat(count("SELECT COUNT(*) FROM bulletin_board_entries WHERE election_id = ?", s.electionId)).isEqualTo(VOTERS);
        return new Run(s, truth);
    }

    // ------------------------------------------------------------------ null model for the ordering attacks

    /**
     * Largest acceptable probability that a correct implementation is reported as leaking (per ordering channel).
     * Five channels are scored, so the whole test has a false-failure probability below 5e-6. The original
     * deterministic ordering scores every pair and must fall far below this level (checked, not assumed).
     */
    private static final double ALPHA = 1e-6;

    /** Sequential issue-then-vote runs: the only interleaving in which issuance order equals arrival order. */
    private static final int SCORED_RUNS = 4;

    /**
     * Distribution of the number of correct guesses when a fixed guess is compared with a uniformly random
     * permutation of {@code n} items (fixed points): P(k) = C(n,k) * D(n-k) / n!, D = derangement numbers.
     * Mean 1 and variance 1 for every n >= 2, so a uniform guess within a set of size B succeeds with
     * probability 1/B per item.
     */
    static double[] fixedPoints(int n) {
        double[] derangements = new double[n + 1];
        derangements[0] = 1;
        if (n >= 1) {
            derangements[1] = 0;
        }
        for (int i = 2; i <= n; i++) {
            derangements[i] = (i - 1) * (derangements[i - 1] + derangements[i - 2]);
        }
        double factorial = 1;
        for (int i = 2; i <= n; i++) {
            factorial *= i;
        }
        double[] p = new double[n + 1];
        for (int k = 0; k <= n; k++) {
            p[k] = binomial(n, k) * derangements[n - k] / factorial;
        }
        return p;
    }

    private static double binomial(int n, int k) {
        double b = 1;
        for (int i = 1; i <= k; i++) {
            b = b * (n - k + i) / i;
        }
        return b;
    }

    /** Distribution of the sum of independent counts. */
    static double[] convolve(double[] a, double[] b) {
        double[] c = new double[a.length + b.length - 1];
        for (int i = 0; i < a.length; i++) {
            for (int j = 0; j < b.length; j++) {
                c[i + j] += a[i] * b[j];
            }
        }
        return c;
    }

    /** Null distribution of correct guesses for one run whose ballots were shuffled within the given groups. */
    static double[] nullForGroups(List<Integer> groupSizes) {
        double[] d = {1.0};
        for (int size : groupSizes) {
            d = convolve(d, fixedPoints(size));
        }
        return d;
    }

    /** P(X >= observed) under the null distribution. */
    static double upperTail(double[] distribution, int observed) {
        double p = 0;
        for (int k = Math.max(0, observed); k < distribution.length; k++) {
            p += distribution[k];
        }
        return Math.min(1.0, p);
    }

    /** Sizes of the shuffled bulletin batches, in publication order, from the anonymous BALLOTS_PUBLISHED events. */
    private List<Integer> bulletinBatches(Scenario s) throws Exception {
        List<Integer> sizes = new ArrayList<>();
        for (String metadata : jdbc.queryForList("SELECT metadata_json FROM audit_logs WHERE election_id = ? "
                + "AND event_type = 'BALLOTS_PUBLISHED' ORDER BY seq", String.class, s.electionId)) {
            int published = json.readTree(metadata).get("published").asInt();
            if (published > 0) {
                sizes.add(published);
            }
        }
        return sizes;
    }

    // ------------------------------------------------------------------ tests

    @Test
    void attackCodeIsEffectiveAgainstSequentialMetadata() {
        // Control: with the pre-fix metadata (ballot order == issuance order), the ordering attack pairs everyone.
        Map<Long, Long> truth = new HashMap<>();
        Map<Long, Long> guess = new HashMap<>();
        for (long u = 1; u <= VOTERS; u++) {
            truth.put(u, 100 + u);
            guess.put(u, 100 + u);
        }
        assertThat(correct(guess, truth)).isEqualTo(VOTERS);
    }

    @Test
    void nullModelIsExactAndDetectsDeterministicOrdering() {
        // Fixed points of a random permutation: exact values for n = 3 (P(0)=1/3, P(1)=1/2, P(3)=1/6) and mean 1.
        double[] three = fixedPoints(3);
        assertThat(three[0]).isCloseTo(1.0 / 3, org.assertj.core.data.Offset.offset(1e-12));
        assertThat(three[1]).isCloseTo(0.5, org.assertj.core.data.Offset.offset(1e-12));
        assertThat(three[2]).isZero();
        assertThat(three[3]).isCloseTo(1.0 / 6, org.assertj.core.data.Offset.offset(1e-12));
        for (int n = 2; n <= VOTERS; n++) {
            double[] d = fixedPoints(n);
            double total = 0;
            double mean = 0;
            for (int k = 0; k < d.length; k++) {
                total += d[k];
                mean += k * d[k];
            }
            assertThat(total).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-12));
            assertThat(mean).as("a uniform guess within a set of %d succeeds 1/%d of the time per item", n, n)
                    .isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-12));
        }
        // Power: the original implementation published in arrival order and used sequential ids, so the attack
        // paired every voter in every scored run. That outcome is far below ALPHA under both null models.
        double[] randomIds = {1.0};
        double[] batches = {1.0};
        for (int r = 0; r < SCORED_RUNS; r++) {
            randomIds = convolve(randomIds, fixedPoints(VOTERS));
            batches = convolve(batches, nullForGroups(List.of(3, 3, 2)));
        }
        assertThat(upperTail(randomIds, SCORED_RUNS * VOTERS)).isLessThan(ALPHA);
        assertThat(upperTail(batches, SCORED_RUNS * VOTERS)).isLessThan(ALPHA);
        // Expected chance-level scores: 1 per run for random ids, 1 per batch for the bulletin board.
        assertThat(upperTail(randomIds, SCORED_RUNS)).isGreaterThan(0.3);
        assertThat(upperTail(batches, SCORED_RUNS * 3)).isGreaterThan(0.3);
    }

    @Test
    void credentialIssuanceCannotBePairedWithBallotsAcrossInterleavings() throws Exception {
        List<String> orders = new ArrayList<>();
        for (int r = 0; r < SCORED_RUNS; r++) {
            orders.add("issue-then-vote-each");
        }
        orders.addAll(List.of("issue-all-vote-reverse", "issue-all-vote-random", "concurrent"));
        Map<String, Integer> totalCorrect = new LinkedHashMap<>();
        Map<String, double[]> nullModel = new LinkedHashMap<>();
        int scoredPairs = 0;
        for (String order : orders) {
            Run run = election(order);
            Scenario s = run.s();

            // 1. The original audit-adjacency attack finds nothing to pair (exact, deterministic).
            Map<Long, Long> adjacency = auditAdjacencyAttack(s);
            assertThat(adjacency).as("audit adjacency pairs (%s)", order).isEmpty();
            assertThat(count("SELECT COUNT(*) FROM audit_logs WHERE election_id = ? AND event_type = 'BALLOT_ACCEPTED'",
                    s.electionId)).isZero();
            assertThat(count("SELECT COUNT(*) FROM audit_logs WHERE election_id = ? AND event_type = 'BALLOTS_PUBLISHED' "
                    + "AND actor_ref IS NOT NULL", s.electionId)).as("batch events carry no actor").isZero();

            // 2. Ordering attacks (k-th credential issued <-> k-th row of an anonymous-side ordering). Scored only on
            //    sequential runs, where issuance order equals arrival order and the original code leaked everything.
            //    Row ids are random, so each id ordering is a uniform permutation of the run's ballots; the bulletin
            //    board reveals the batch a ballot belongs to (documented) but its position within the batch is a
            //    uniform shuffle, so a guess succeeds with probability 1/B for a batch of size B.
            List<Integer> batches = bulletinBatches(s);
            assertThat(batches.stream().mapToInt(Integer::intValue).sum()).as("all ballots published in batches")
                    .isEqualTo(VOTERS);
            if (order.equals("issue-then-vote-each")) {
                scoredPairs += VOTERS;
                for (var o : ORDERINGS.entrySet()) {
                    int c = correct(orderingAttack(s, o.getValue()), run.truth());
                    totalCorrect.merge(o.getKey(), c, Integer::sum);
                    double[] runNull = o.getKey().equals("bulletin seq") ? nullForGroups(batches)
                            : fixedPoints(VOTERS);
                    nullModel.merge(o.getKey(), runNull, AnonymityIT::convolve);
                }
            }

            // 3. No per-ballot timing or selection-count metadata remains for new ballots.
            assertThat(count("SELECT COUNT(*) FROM ballots WHERE election_id = ? AND (accepted_at_minute IS NOT NULL "
                    + "OR selection_count IS NOT NULL)", s.electionId)).isZero();
            assertThat(count("SELECT COUNT(*) FROM verification_receipts WHERE election_id = ? AND issued_at_minute IS NOT NULL",
                    s.electionId)).isZero();

            // 4. Batch anonymity: during voting, ballots reach the board only in batches of at least the configured
            //    size (3 in tests); only the final batch at close may be smaller.
            for (Map<String, Object> row : jdbc.queryForList("SELECT metadata_json FROM audit_logs WHERE election_id = ? "
                    + "AND event_type = 'BALLOTS_PUBLISHED'", s.electionId)) {
                JsonNode m = json.readTree((String) row.get("metadata_json"));
                if ("batch".equals(m.get("trigger").asText())) {
                    assertThat(m.get("published").asInt()).isGreaterThanOrEqualTo(3);
                }
            }
            long distinctPublicationTimes = count("SELECT COUNT(DISTINCT posted_at_minute) FROM bulletin_board_entries "
                    + "WHERE election_id = ?", s.electionId);
            assertThat(distinctPublicationTimes).isLessThanOrEqualTo(batches.size());
        }
        // 5. Statistical check per channel: the observed score must be plausible for a correct implementation
        //    (p >= ALPHA). The original implementation scored all pairs, which the null model rejects (see
        //    nullModelIsExactAndDetectsDeterministicOrdering and the power check below).
        StringBuilder report = new StringBuilder();
        for (var e : totalCorrect.entrySet()) {
            double[] dist = nullModel.get(e.getKey());
            double mean = 0;
            for (int k = 0; k < dist.length; k++) {
                mean += k * dist[k];
            }
            double p = upperTail(dist, e.getValue());
            report.append(String.format("%s: %d/%d correct (chance %.1f, p=%.3g); ", e.getKey(), e.getValue(),
                    scoredPairs, mean, p));
            assertThat(upperTail(dist, scoredPairs)).as("power against full pairing via %s", e.getKey()).isLessThan(ALPHA);
            assertThat(p).as("%s ordering pairs voters better than chance: %d of %d (p=%s)", e.getKey(), e.getValue(),
                    scoredPairs, p).isGreaterThanOrEqualTo(ALPHA);
        }
        System.out.println("[AnonymityIT] " + report);
    }

    @Test
    void anonymousEndpointsNeverExposeOrderingOrIdentity() throws Exception {
        Run run = election("issue-then-vote-each");
        Scenario s = run.s();
        String board = getOk("/api/public/elections/" + s.electionId + "/bulletin?size=100", null).toString();
        assertThat(board).doesNotContain("@it.digivote.test").doesNotContain("ballotId");
        for (Long ballotId : run.truth().values()) {
            assertThat(board).doesNotContain("\"" + ballotId + "\"");
        }
        String participation = getOk("/api/elections/" + s.electionId + "/participation", s.admin).toString();
        assertThat(participation).doesNotContain("user");
    }
}
