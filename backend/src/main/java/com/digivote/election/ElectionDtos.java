package com.digivote.election;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class ElectionDtos {

    private ElectionDtos() {
    }

    public record CreateElectionRequest(@NotBlank @Size(max = 160) String title,
                                        @Size(max = 2000) String description) {
    }

    public record UpdateElectionRequest(@NotBlank @Size(max = 160) String title,
                                        @Size(max = 2000) String description) {
    }

    public record RulesRequest(
            @Min(1) @Max(50) int maxSelections,
            @NotNull CountingMethod countingMethod,
            boolean requireCandidateApproval,
            boolean anonymousVoting,
            boolean publicResults,
            boolean qrReceipts,
            boolean receiptsRequired,
            boolean notaEnabled,
            boolean candidatesMayVote,
            boolean administratorsMayVote,
            @NotNull ElectionRule.PublicationPolicy resultPublicationPolicy,
            @Min(1) @Max(100) int minCandidates,
            Instant campaignStart,
            Instant campaignEnd,
            Instant votingStart,
            Instant votingEnd,
            Instant withdrawalDeadline) {

        public RuleSettings toSettings() {
            return new RuleSettings(maxSelections, countingMethod, requireCandidateApproval, anonymousVoting,
                    publicResults, qrReceipts, receiptsRequired, notaEnabled, candidatesMayVote,
                    administratorsMayVote, resultPublicationPolicy, minCandidates, campaignStart, campaignEnd,
                    votingStart, votingEnd, withdrawalDeadline);
        }
    }

    public record TransitionRequest(@NotNull ElectionStatus target, @Size(max = 500) String note) {
    }

    public record AssignAdministratorRequest(@NotNull Long userId) {
    }

    public record AdministratorView(Long userId, String fullName, String email, Instant assignedAt) {
    }

    /** The caller's own relationship to the election (never other people's). */
    public record MyRelation(boolean operator, boolean eligibleVoter, boolean mayVote, boolean candidate,
                             boolean credentialIssued, String role) {
    }

    public record ElectionView(Long id, Long organizationId, String organizationName, String title,
                               String description, ElectionStatus status, Instant createdAt, Instant updatedAt,
                               Instant archivedAt, RuleSettings rules, long activeCandidates,
                               long eligibleVoters, MyRelation me, boolean hasBanner) {
    }

    public record TimelineEntry(ElectionStatus from, ElectionStatus to, Instant occurredAt, String actorName,
                                String note) {
    }

    public record ElectionSummary(Long id, String title, ElectionStatus status, Instant votingStart,
                                  Instant votingEnd, Long organizationId, String organizationName) {
    }

    public record ElectionPage(List<ElectionView> content) {
    }
}
