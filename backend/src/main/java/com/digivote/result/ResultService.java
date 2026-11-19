package com.digivote.result;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.candidate.Candidate;
import com.digivote.candidate.CandidateRepository;
import com.digivote.common.ApiException;
import com.digivote.common.Hashing;
import com.digivote.crypto.Paillier;
import com.digivote.election.Election;
import com.digivote.election.ElectionRepository;
import com.digivote.election.ElectionRule;
import com.digivote.election.ElectionRuleRepository;
import com.digivote.election.ElectionStatus;
import com.digivote.election.rules.RuleEngine;
import com.digivote.election.state.ElectionStateMachine;
import com.digivote.verification.BulletinBoardService;
import com.digivote.voting.Ballot;
import com.digivote.voting.BallotCommitments;
import com.digivote.voting.BallotRepository;
import com.digivote.voting.ElectionKeyService;
import com.digivote.voting.ElectionKeys;
import com.digivote.voting.Vote;
import com.digivote.voting.VoteRepository;
import com.digivote.voting.VotingTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Tally service. Works only with the anonymous ballot set: it multiplies the Paillier ciphertexts of
 * each option across all accepted ballots (homomorphic addition) and decrypts only those per-option
 * aggregates. Individual ballots are never decrypted, and no identity table is read.
 */
@Service
public class ResultService {

    private final ElectionRepository elections;
    private final ElectionRuleRepository rules;
    private final CandidateRepository candidates;
    private final BallotRepository ballots;
    private final VoteRepository votes;
    private final VotingTokenRepository tokens;
    private final ElectionResultRepository results;
    private final ElectionResultItemRepository items;
    private final ElectionKeyService keyService;
    private final BulletinBoardService bulletin;
    private final CountingStrategyRegistry strategies;
    private final ElectionStateMachine stateMachine;
    private final RuleEngine ruleEngine;
    private final AccessControlService access;
    private final AuditService audit;
    private final Clock clock;

    public ResultService(ElectionRepository elections, ElectionRuleRepository rules, CandidateRepository candidates,
                         BallotRepository ballots, VoteRepository votes, VotingTokenRepository tokens,
                         ElectionResultRepository results, ElectionResultItemRepository items,
                         ElectionKeyService keyService, BulletinBoardService bulletin,
                         CountingStrategyRegistry strategies, ElectionStateMachine stateMachine,
                         RuleEngine ruleEngine, AccessControlService access, AuditService audit, Clock clock) {
        this.elections = elections;
        this.rules = rules;
        this.candidates = candidates;
        this.ballots = ballots;
        this.votes = votes;
        this.tokens = tokens;
        this.results = results;
        this.items = items;
        this.keyService = keyService;
        this.bulletin = bulletin;
        this.strategies = strategies;
        this.stateMachine = stateMachine;
        this.ruleEngine = ruleEngine;
        this.access = access;
        this.audit = audit;
        this.clock = clock;
    }

    /** Ballot options in ballot order: active candidates, then NOTA when enabled. */
    public record BallotOption(int index, Long candidateId, String label, boolean nota) {
    }

    public List<BallotOption> ballotOptions(Long electionId, ElectionRule rule) {
        List<BallotOption> options = new ArrayList<>();
        List<Candidate> active = candidates.findByElectionIdAndStatusOrderByBallotPositionAsc(electionId,
                Candidate.Status.ACTIVE);
        for (int i = 0; i < active.size(); i++) {
            options.add(new BallotOption(i, active.get(i).getId(), active.get(i).getDisplayName(), false));
        }
        if (rule.isNotaEnabled()) {
            options.add(new BallotOption(active.size(), null, "None Of The Above", true));
        }
        return options;
    }

    @Transactional
    public ResultDtos.ResultView generate(Long electionId) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.MANAGE_ELECTION);
        Election election = a.election();
        stateMachine.require(stateMachine.stateOf(election).allowsResultGeneration(), election, "generate results");
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        Optional<ElectionResult> existing = results.findByElectionId(electionId);
        if (existing.isPresent() && existing.get().getStatus() == ElectionResult.Status.PUBLISHED) {
            throw ApiException.conflict("RESULTS_PUBLISHED", "Published results cannot be regenerated");
        }

        ElectionKeys keys = keyService.require(electionId);
        Paillier.PublicKey pub = keyService.paillierPublic(keys);
        List<BallotOption> options = ballotOptions(electionId, rule);
        List<Ballot> accepted = ballots.findConfirmed(electionId);

        BulletinBoardService.ChainCheck chain = bulletin.verify(electionId);
        if (!chain.valid() || chain.entries() != accepted.size()) {
            throw ApiException.conflict("BULLETIN_INCONSISTENT",
                    "Bulletin board does not verify against the accepted ballots; results not generated");
        }
        if (tokens.countByElectionId(electionId) != ballots.countByElectionId(electionId)) {
            throw ApiException.conflict("TOKENS_INCONSISTENT", "Spent tokens do not match accepted ballots");
        }

        ResultDtos.AggregationCheck validation = validateBallots(electionId, accepted, options.size(), pub);
        if (!validation.valid()) {
            throw ApiException.conflict("BALLOT_VALIDATION_FAILED", validation.problems().get(0));
        }

        BigInteger[] aggregates = aggregate(electionId, options.size(), pub);
        Paillier.PrivateKey priv = keyService.paillierPrivate(keys);
        List<CountingStrategy.OptionTally> tallies = new ArrayList<>();
        int totalSelections = 0;
        for (BallotOption o : options) {
            long count = Paillier.decrypt(priv, aggregates[o.index()]).longValueExact();
            totalSelections += (int) count;
            tallies.add(new CountingStrategy.OptionTally(o.index(), o.candidateId(), o.label(), o.nota(), count));
        }
        // New ballots do not record a selection count (privacy); the strategy's bounds check covers them.
        // Historic ballots that still carry one are cross-checked exactly.
        boolean allCounted = accepted.stream().allMatch(b -> b.getSelectionCount() != null);
        int expectedSelections = allCounted ? accepted.stream().mapToInt(Ballot::getSelectionCount).sum() : totalSelections;
        if (expectedSelections != totalSelections) {
            throw ApiException.conflict("TALLY_INCONSISTENT",
                    "Decrypted totals do not match the recorded selection counts");
        }

        CountingStrategy strategy = strategies.forMethod(rule.getCountingMethod());
        CountingStrategy.Outcome outcome = strategy.count(tallies, accepted.size(), totalSelections,
                rule.getMaxSelections());

        String canonical = electionId + "|" + rule.getCountingMethod() + "|" + accepted.size() + "|" + chain.headHash()
                + "|" + tallies.stream().map(t -> t.optionIndex() + ":" + t.votes()).collect(Collectors.joining(","));
        String resultHash = Hashing.sha256Hex(canonical);
        Instant now = clock.instant();

        ElectionResult result = existing.orElseGet(() ->
                new ElectionResult(electionId, rule.getCountingMethod(), a.user().userId(), now));
        boolean changed = existing.isPresent() && !existing.get().getResultHash().equals(resultHash);
        result.record(accepted.size(), totalSelections, chain.headHash(), outcome.tie(), resultHash,
                a.user().userId(), now);
        result = results.save(result);
        items.deleteByResultId(result.getId());
        for (CountingStrategy.RankedOption r : outcome.ranking()) {
            CountingStrategy.OptionTally t = r.option();
            items.save(new ElectionResultItem(result.getId(), t.optionIndex(), t.candidateId(), t.label(),
                    (int) t.votes(), r.rank(), r.winner(), aggregates[t.optionIndex()].toString(16)));
        }
        audit.record(AuditEventType.RESULTS_GENERATED, election.getOrganizationId(), electionId, a.user().userId(),
                Map.of("acceptedBallots", accepted.size(), "resultHash", resultHash,
                        "generation", result.getGenerationCount(), "changedSincePrevious", changed,
                        "tie", outcome.tie()));
        return view(election, result, outcome.explanation());
    }

    /** Used by the lifecycle service when moving VERIFICATION -> PUBLISHED. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(Long electionId, Long userId) {
        ElectionResult result = results.findByElectionId(electionId)
                .orElseThrow(() -> ApiException.rule("RESULTS_NOT_GENERATED", "Generate results before publishing"));
        result.publish(userId, clock.instant());
    }

    public boolean hasGeneratedResults(Long electionId) {
        return results.findByElectionId(electionId).isPresent();
    }

    /** Results for organization members; non-operators only see published results. */
    @Transactional(readOnly = true)
    public ResultDtos.ResultView forMember(Long electionId) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        ElectionResult result = results.findByElectionId(electionId)
                .orElseThrow(() -> ApiException.notFound("Results"));
        boolean privileged = a.operator() || a.user().can(Permission.VIEW_ELECTION_INTERNALS);
        if (result.getStatus() != ElectionResult.Status.PUBLISHED && !privileged) {
            throw ApiException.notFound("Results");
        }
        return view(a.election(), result, null);
    }

    /** Public results: only when published and the election's rules allow public visibility. */
    @Transactional(readOnly = true)
    public ResultDtos.ResultView forPublic(Long electionId) {
        Election election = elections.findById(electionId).orElseThrow(() -> ApiException.notFound("Results"));
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        ElectionResult result = results.findByElectionId(electionId)
                .filter(r -> r.getStatus() == ElectionResult.Status.PUBLISHED)
                .orElseThrow(() -> ApiException.notFound("Results"));
        if (!ruleEngine.resultsPublicFor(rule)) {
            throw ApiException.notFound("Results");
        }
        return view(election, result, null);
    }

    /**
     * Independent recomputation for auditors: re-derives every ballot commitment from its ciphertexts and
     * re-multiplies the ciphertexts per option, comparing with the stored aggregates used for decryption.
     */
    @Transactional(readOnly = true)
    public ResultDtos.AggregationCheck verifyAggregation(Long electionId) {
        ElectionKeys keys = keyService.require(electionId);
        Paillier.PublicKey pub = keyService.paillierPublic(keys);
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        int optionCount = ballotOptions(electionId, rule).size();
        List<Ballot> accepted = ballots.findConfirmed(electionId);
        ResultDtos.AggregationCheck ballotCheck = validateBallots(electionId, accepted, optionCount, pub);
        List<String> problems = new ArrayList<>(ballotCheck.problems());
        int aggregateMismatches = 0;
        Optional<ElectionResult> result = results.findByElectionId(electionId);
        if (result.isPresent()) {
            BigInteger[] recomputed = aggregate(electionId, optionCount, pub);
            for (ElectionResultItem item : items.findByResultIdOrderByOptionIndexAsc(result.get().getId())) {
                if (!recomputed[item.getOptionIndex()].toString(16).equals(item.getAggregateCiphertext())) {
                    aggregateMismatches++;
                    problems.add("Aggregate ciphertext mismatch for option " + item.getOptionIndex());
                }
            }
            if (result.get().getAcceptedBallots() != accepted.size()) {
                problems.add("Result ballot count differs from accepted ballots");
            }
        }
        return new ResultDtos.AggregationCheck(problems.isEmpty(), accepted.size(),
                ballotCheck.commitmentMismatches(), ballotCheck.malformedBallots(), optionCount,
                aggregateMismatches, List.copyOf(problems));
    }

    private ResultDtos.AggregationCheck validateBallots(Long electionId, List<Ballot> accepted, int optionCount,
                                                        Paillier.PublicKey pub) {
        Map<Long, List<Vote>> byBallot = new HashMap<>();
        for (Vote v : votes.findAllForElection(electionId)) {
            byBallot.computeIfAbsent(v.getBallotId(), k -> new ArrayList<>()).add(v);
        }
        int commitmentMismatches = 0;
        int malformed = 0;
        List<String> problems = new ArrayList<>();
        for (Ballot b : accepted) {
            List<Vote> vs = byBallot.getOrDefault(b.getId(), List.of());
            boolean shapeOk = vs.size() == optionCount;
            for (int i = 0; shapeOk && i < vs.size(); i++) {
                shapeOk = vs.get(i).getOptionIndex() == i;
                try {
                    Paillier.requireValidCiphertext(pub, new BigInteger(vs.get(i).getCiphertext(), 16));
                } catch (IllegalArgumentException e) {
                    shapeOk = false;
                }
            }
            if (!shapeOk) {
                malformed++;
                problems.add("Ballot with commitment " + b.getBallotCommitment().substring(0, 12) + "… is malformed");
                continue;
            }
            String recomputed = BallotCommitments.commit(electionId, vs.stream().map(Vote::getCiphertext).toList());
            if (!recomputed.equals(b.getBallotCommitment())) {
                commitmentMismatches++;
                problems.add("Ballot commitment " + b.getBallotCommitment().substring(0, 12) + "… does not match its ciphertexts");
            }
        }
        return new ResultDtos.AggregationCheck(problems.isEmpty(), accepted.size(), commitmentMismatches, malformed,
                optionCount, 0, problems);
    }

    private BigInteger[] aggregate(Long electionId, int optionCount, Paillier.PublicKey pub) {
        BigInteger[] aggregates = new BigInteger[optionCount];
        for (int i = 0; i < optionCount; i++) {
            aggregates[i] = Paillier.identity();
        }
        for (Vote v : votes.findAllForElection(electionId)) {
            if (v.getOptionIndex() < optionCount) {
                aggregates[v.getOptionIndex()] = Paillier.add(pub, aggregates[v.getOptionIndex()],
                        new BigInteger(v.getCiphertext(), 16));
            }
        }
        return aggregates;
    }

    private ResultDtos.ResultView view(Election election, ElectionResult result, String explanation) {
        List<ElectionResultItem> rows = items.findByResultIdOrderByOptionIndexAsc(result.getId());
        int total = rows.stream().mapToInt(ElectionResultItem::getVotes).sum();
        List<ResultDtos.ResultItemView> itemViews = rows.stream()
                .sorted((x, y) -> x.getRank() != y.getRank() ? Integer.compare(x.getRank(), y.getRank())
                        : Integer.compare(x.getOptionIndex(), y.getOptionIndex()))
                .map(i -> new ResultDtos.ResultItemView(i.getOptionIndex(), i.getCandidateId(), i.getLabel(),
                        i.getVotes(), total == 0 ? 0.0 : Math.round(i.getVotes() * 10000.0 / total) / 100.0,
                        i.getRank(), i.isWinner()))
                .toList();
        String text = explanation != null ? explanation : explain(result, rows);
        return new ResultDtos.ResultView(election.getId(), election.getTitle(), result.getStatus().name(),
                result.getCountingMethod(), result.getAcceptedBallots(), result.getTotalSelections(),
                result.isTieDetected(), text, result.getBulletinHeadHash(), result.getResultHash(),
                result.getGenerationCount(), result.getGeneratedAt(), result.getPublishedAt(), itemViews);
    }

    private String explain(ElectionResult result, List<ElectionResultItem> rows) {
        if (result.getAcceptedBallots() == 0) {
            return "No ballots were accepted; no winner is declared.";
        }
        if (result.isTieDetected()) {
            return "Tie for first place; no winner is declared and the tie is referred to the organization's tie policy.";
        }
        return rows.stream().filter(ElectionResultItem::isWinner).findFirst()
                .map(w -> w.getLabel() + " wins with " + w.getVotes() + " vote(s). " + (result.getCountingMethod()
                        == com.digivote.election.CountingMethod.PLURALITY
                        ? "Plurality: the candidate with the most votes wins."
                        : "Approval: the candidate approved on the most ballots wins."))
                .orElse("None Of The Above received the most votes; no candidate is declared the winner.");
    }

    public boolean isPublished(Long electionId) {
        return results.findByElectionId(electionId).map(r -> r.getStatus() == ElectionResult.Status.PUBLISHED)
                .orElse(false);
    }

    public Optional<ElectionResult> find(Long electionId) {
        return results.findByElectionId(electionId);
    }

    public static boolean statusAllowsResults(ElectionStatus status) {
        return status == ElectionStatus.VERIFICATION || status == ElectionStatus.PUBLISHED
                || status == ElectionStatus.ARCHIVED;
    }
}
