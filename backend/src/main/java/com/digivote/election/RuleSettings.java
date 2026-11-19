package com.digivote.election;

import java.time.Instant;

/** Immutable value object for a complete rule configuration (also the API payload for rule edits). */
public record RuleSettings(
        int maxSelections,
        CountingMethod countingMethod,
        boolean requireCandidateApproval,
        boolean anonymousVoting,
        boolean publicResults,
        boolean qrReceipts,
        boolean receiptsRequired,
        boolean notaEnabled,
        boolean candidatesMayVote,
        boolean administratorsMayVote,
        ElectionRule.PublicationPolicy resultPublicationPolicy,
        int minCandidates,
        Instant campaignStart,
        Instant campaignEnd,
        Instant votingStart,
        Instant votingEnd,
        Instant withdrawalDeadline) {
}
