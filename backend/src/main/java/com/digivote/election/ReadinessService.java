package com.digivote.election;

import com.digivote.candidate.Candidate;
import com.digivote.candidate.CandidateApplication;
import com.digivote.candidate.CandidateApplicationRepository;
import com.digivote.candidate.CandidateRepository;
import com.digivote.election.rules.RuleEngine;
import com.digivote.election.rules.RuleViolation;
import com.digivote.voting.EligibleVoter;
import com.digivote.voting.EligibleVoterRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Evaluates whether an election may move to its next stage; the same checks guard transitions and feed the UI. */
@Service
public class ReadinessService {

    private final ElectionRuleRepository rules;
    private final CandidateRepository candidates;
    private final CandidateApplicationRepository applications;
    private final EligibleVoterRepository voters;
    private final RuleEngine ruleEngine;
    private final Clock clock;

    public ReadinessService(ElectionRuleRepository rules, CandidateRepository candidates,
                            CandidateApplicationRepository applications, EligibleVoterRepository voters,
                            RuleEngine ruleEngine, Clock clock) {
        this.rules = rules;
        this.candidates = candidates;
        this.applications = applications;
        this.voters = voters;
        this.ruleEngine = ruleEngine;
        this.clock = clock;
    }

    public record Check(String key, String label, boolean passed, String detail) {
    }

    public record Readiness(ElectionStatus currentStatus, ElectionStatus nextStatus, boolean ready, int score,
                            List<Check> checks) {
    }

    @Transactional(readOnly = true)
    public Readiness evaluate(Election election) {
        ElectionRule rule = rules.findById(election.getId()).orElseThrow();
        Instant now = clock.instant();
        List<Check> checks = new ArrayList<>();
        ElectionStatus next = switch (election.getStatus()) {
            case DRAFT -> ElectionStatus.REGISTRATION;
            case REGISTRATION -> ElectionStatus.CAMPAIGN;
            case CAMPAIGN -> ElectionStatus.VOTING;
            case VOTING -> ElectionStatus.VERIFICATION;
            case VERIFICATION -> ElectionStatus.PUBLISHED;
            case PUBLISHED -> ElectionStatus.ARCHIVED;
            case ARCHIVED -> null;
        };

        List<RuleViolation> violations = ruleEngine.validateForPublication(rule.toSettings(), now);
        checks.add(new Check("rules", "Election rules are complete and consistent", violations.isEmpty(),
                violations.isEmpty() ? "All rules valid" : violations.get(0).message()));

        long activeCandidates = candidates.countByElectionIdAndStatus(election.getId(), Candidate.Status.ACTIVE);
        long pending = applications.countByElectionIdAndStatus(election.getId(), CandidateApplication.Status.SUBMITTED);
        long eligible = voters.countByElectionIdAndStatus(election.getId(), EligibleVoter.Status.ELIGIBLE);

        if (election.getStatus().ordinal() >= ElectionStatus.REGISTRATION.ordinal()) {
            checks.add(new Check("candidates", "At least " + rule.getMinCandidates() + " approved candidate(s)",
                    activeCandidates >= rule.getMinCandidates(), activeCandidates + " approved"));
            checks.add(new Check("pendingApplications", "No applications awaiting review",
                    !rule.isRequireCandidateApproval() || pending == 0, pending + " pending"));
            int options = ruleEngine.optionCount(rule, (int) activeCandidates);
            checks.add(new Check("selections", "Maximum selections fit the ballot",
                    rule.getMaxSelections() <= Math.max(options - (rule.isNotaEnabled() ? 1 : 0), 1),
                    rule.getMaxSelections() + " selection(s), " + options + " option(s)"));
        }
        if (election.getStatus().ordinal() >= ElectionStatus.CAMPAIGN.ordinal()
                || election.getStatus() == ElectionStatus.REGISTRATION) {
            checks.add(new Check("voters", "At least one eligible voter", eligible > 0, eligible + " eligible"));
        }
        if (election.getStatus() == ElectionStatus.CAMPAIGN) {
            boolean open = ruleEngine.votingWindowOpen(rule, now);
            checks.add(new Check("votingWindow", "Current time is inside the configured voting window", open,
                    rule.getVotingStart() == null ? "No voting window"
                            : "Window " + rule.getVotingStart() + " to " + rule.getVotingEnd()));
        }

        List<Check> relevant = relevantFor(election.getStatus(), checks);
        boolean ready = next != null && relevant.stream().allMatch(Check::passed);
        int score = relevant.isEmpty() ? 100
                : (int) Math.round(100.0 * relevant.stream().filter(Check::passed).count() / relevant.size());
        return new Readiness(election.getStatus(), next, ready, score, List.copyOf(checks));
    }

    /** Which checks gate the transition out of the current state. */
    private List<Check> relevantFor(ElectionStatus status, List<Check> checks) {
        List<String> keys = switch (status) {
            case DRAFT -> List.of("rules");
            case REGISTRATION -> List.of("rules", "candidates", "pendingApplications", "selections");
            case CAMPAIGN -> List.of("rules", "candidates", "pendingApplications", "selections", "voters", "votingWindow");
            default -> List.of();
        };
        return checks.stream().filter(c -> keys.contains(c.key())).toList();
    }
}
