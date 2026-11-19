package com.digivote.election.rules;

import com.digivote.common.ApiException;
import com.digivote.election.CountingMethod;
import com.digivote.election.ElectionRule;
import com.digivote.election.RuleSettings;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The single place where election rules are interpreted. Services pass the persisted
 * {@link ElectionRule}; nothing else hardcodes rule checks.
 */
@Component
public class RuleEngine {

    /** Structural consistency of a rule set (checked on every save). */
    public List<RuleViolation> validateStructure(RuleSettings s) {
        List<RuleViolation> v = new ArrayList<>();
        if (s.countingMethod() == null) {
            v.add(new RuleViolation("countingMethod", "REQUIRED", "Counting method is required"));
        }
        if (s.resultPublicationPolicy() == null) {
            v.add(new RuleViolation("resultPublicationPolicy", "REQUIRED", "Result publication policy is required"));
        }
        if (s.maxSelections() < 1 || s.maxSelections() > 50) {
            v.add(new RuleViolation("maxSelections", "RANGE", "Maximum selections must be between 1 and 50"));
        }
        if (s.countingMethod() == CountingMethod.PLURALITY && s.maxSelections() != 1) {
            v.add(new RuleViolation("maxSelections", "PLURALITY_SINGLE_CHOICE",
                    "Plurality counting requires exactly one selection per ballot"));
        }
        if (s.countingMethod() == CountingMethod.APPROVAL && s.maxSelections() < 2) {
            v.add(new RuleViolation("maxSelections", "APPROVAL_MULTI_CHOICE",
                    "Approval counting requires at least two selections per ballot"));
        }
        if (s.minCandidates() < 1 || s.minCandidates() > 100) {
            v.add(new RuleViolation("minCandidates", "RANGE", "Minimum candidates must be between 1 and 100"));
        }
        if (s.minCandidates() == 1 && !s.notaEnabled()) {
            v.add(new RuleViolation("notaEnabled", "SINGLE_CANDIDATE_NEEDS_NOTA",
                    "A single-candidate election must offer None Of The Above"));
        }
        if (s.countingMethod() == CountingMethod.APPROVAL && s.maxSelections() > s.minCandidates()) {
            v.add(new RuleViolation("maxSelections", "EXCEEDS_MIN_CANDIDATES",
                    "Maximum selections cannot exceed the minimum number of candidates"));
        }
        if (!s.anonymousVoting()) {
            v.add(new RuleViolation("anonymousVoting", "UNSUPPORTED",
                    "DIGI-VOTE only conducts anonymous (blind-credential) voting"));
        }
        if (s.qrReceipts() && !s.receiptsRequired()) {
            v.add(new RuleViolation("qrReceipts", "QR_NEEDS_RECEIPTS", "QR receipts require receipts to be enabled"));
        }
        if (s.votingStart() != null && s.votingEnd() != null && !s.votingEnd().isAfter(s.votingStart())) {
            v.add(new RuleViolation("votingEnd", "WINDOW", "Voting must end after it starts"));
        }
        if (s.campaignStart() != null && s.campaignEnd() != null && s.campaignEnd().isBefore(s.campaignStart())) {
            v.add(new RuleViolation("campaignEnd", "WINDOW", "Campaign must end after it starts"));
        }
        if (s.campaignEnd() != null && s.votingStart() != null && s.campaignEnd().isAfter(s.votingStart())) {
            v.add(new RuleViolation("campaignEnd", "OVERLAP", "Campaign must end no later than voting starts"));
        }
        if (s.withdrawalDeadline() != null && s.votingStart() != null && s.withdrawalDeadline().isAfter(s.votingStart())) {
            v.add(new RuleViolation("withdrawalDeadline", "AFTER_VOTING",
                    "Withdrawal deadline must be no later than the voting start"));
        }
        return v;
    }

    /** Everything required before an election may leave DRAFT. */
    public List<RuleViolation> validateForPublication(RuleSettings s, Instant now) {
        List<RuleViolation> v = new ArrayList<>(validateStructure(s));
        if (s.votingStart() == null) {
            v.add(new RuleViolation("votingStart", "REQUIRED", "Voting start time is required"));
        }
        if (s.votingEnd() == null) {
            v.add(new RuleViolation("votingEnd", "REQUIRED", "Voting end time is required"));
        } else if (!s.votingEnd().isAfter(now)) {
            v.add(new RuleViolation("votingEnd", "IN_PAST", "Voting end time must be in the future"));
        }
        return v;
    }

    public void requireValid(List<RuleViolation> violations) {
        if (!violations.isEmpty()) {
            RuleViolation first = violations.get(0);
            throw ApiException.rule("INVALID_RULES", first.message()
                    + (violations.size() > 1 ? " (and " + (violations.size() - 1) + " more)" : ""));
        }
    }

    public boolean votingWindowOpen(ElectionRule rule, Instant now) {
        return rule.getVotingStart() != null && rule.getVotingEnd() != null
                && !now.isBefore(rule.getVotingStart()) && now.isBefore(rule.getVotingEnd());
    }

    public boolean votingWindowEnded(ElectionRule rule, Instant now) {
        return rule.getVotingEnd() != null && !now.isBefore(rule.getVotingEnd());
    }

    public boolean withdrawalAllowed(ElectionRule rule, Instant now) {
        Instant deadline = rule.getWithdrawalDeadline() != null ? rule.getWithdrawalDeadline() : rule.getVotingStart();
        return deadline == null || now.isBefore(deadline);
    }

    /**
     * Validates a ballot's option indexes against the rules. Options 0..candidateCount-1 are candidates in
     * ballot order; when NOTA is enabled it is the last option (index candidateCount) and must be chosen alone.
     */
    public void validateSelection(ElectionRule rule, List<Integer> selections, int candidateCount) {
        if (selections == null || selections.isEmpty()) {
            throw ApiException.badRequest("INVALID_SELECTION", "Select at least one option");
        }
        Set<Integer> distinct = new HashSet<>(selections);
        if (distinct.size() != selections.size()) {
            throw ApiException.badRequest("INVALID_SELECTION", "Duplicate selections are not allowed");
        }
        if (selections.size() > rule.getMaxSelections()) {
            throw ApiException.badRequest("INVALID_SELECTION",
                    "At most " + rule.getMaxSelections() + " selection(s) allowed");
        }
        int optionCount = optionCount(rule, candidateCount);
        for (Integer index : selections) {
            if (index == null || index < 0 || index >= optionCount) {
                throw ApiException.badRequest("INVALID_SELECTION", "Selection is not an option on this ballot");
            }
        }
        if (rule.isNotaEnabled() && distinct.contains(candidateCount) && selections.size() > 1) {
            throw ApiException.badRequest("INVALID_SELECTION", "None Of The Above must be selected on its own");
        }
    }

    public int optionCount(ElectionRule rule, int candidateCount) {
        return candidateCount + (rule.isNotaEnabled() ? 1 : 0);
    }

    public boolean resultsPublicFor(ElectionRule rule) {
        return rule.isPublicResults();
    }

    public boolean autoPublishAfterGeneration(ElectionRule rule) {
        return rule.getResultPublicationPolicy() == ElectionRule.PublicationPolicy.AFTER_VERIFICATION;
    }
}
