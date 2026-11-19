package com.digivote.election;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Persisted, per-election rule set evaluated by {@link com.digivote.election.rules.RuleEngine}. */
@Entity
@Table(name = "election_rules")
public class ElectionRule {

    public enum PublicationPolicy { MANUAL, AFTER_VERIFICATION }

    @Id
    @Column(name = "election_id")
    private Long electionId;

    @Column(name = "max_selections", nullable = false)
    private int maxSelections = 1;

    @Enumerated(EnumType.STRING)
    @Column(name = "counting_method", nullable = false)
    private CountingMethod countingMethod = CountingMethod.PLURALITY;

    @Column(name = "require_candidate_approval", nullable = false)
    private boolean requireCandidateApproval = true;

    @Column(name = "anonymous_voting", nullable = false)
    private boolean anonymousVoting = true;

    @Column(name = "public_results", nullable = false)
    private boolean publicResults = true;

    @Column(name = "qr_receipts", nullable = false)
    private boolean qrReceipts = true;

    @Column(name = "receipts_required", nullable = false)
    private boolean receiptsRequired = true;

    @Column(name = "nota_enabled", nullable = false)
    private boolean notaEnabled;

    @Column(name = "candidates_may_vote", nullable = false)
    private boolean candidatesMayVote = true;

    @Column(name = "administrators_may_vote", nullable = false)
    private boolean administratorsMayVote;

    @Enumerated(EnumType.STRING)
    @Column(name = "result_publication_policy", nullable = false)
    private PublicationPolicy resultPublicationPolicy = PublicationPolicy.MANUAL;

    @Column(name = "min_candidates", nullable = false)
    private int minCandidates = 2;

    @Column(name = "campaign_start")
    private Instant campaignStart;

    @Column(name = "campaign_end")
    private Instant campaignEnd;

    @Column(name = "voting_start")
    private Instant votingStart;

    @Column(name = "voting_end")
    private Instant votingEnd;

    @Column(name = "withdrawal_deadline")
    private Instant withdrawalDeadline;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ElectionRule() {
    }

    public ElectionRule(Long electionId, Instant now) {
        this.electionId = electionId;
        this.updatedAt = now;
    }

    /** Copies every configurable field from a validated candidate rule set. */
    public void replaceWith(RuleSettings s, Instant now) {
        this.maxSelections = s.maxSelections();
        this.countingMethod = s.countingMethod();
        this.requireCandidateApproval = s.requireCandidateApproval();
        this.anonymousVoting = s.anonymousVoting();
        this.publicResults = s.publicResults();
        this.qrReceipts = s.qrReceipts();
        this.receiptsRequired = s.receiptsRequired();
        this.notaEnabled = s.notaEnabled();
        this.candidatesMayVote = s.candidatesMayVote();
        this.administratorsMayVote = s.administratorsMayVote();
        this.resultPublicationPolicy = s.resultPublicationPolicy();
        this.minCandidates = s.minCandidates();
        this.campaignStart = s.campaignStart();
        this.campaignEnd = s.campaignEnd();
        this.votingStart = s.votingStart();
        this.votingEnd = s.votingEnd();
        this.withdrawalDeadline = s.withdrawalDeadline();
        this.updatedAt = now;
    }

    public RuleSettings toSettings() {
        return new RuleSettings(maxSelections, countingMethod, requireCandidateApproval, anonymousVoting,
                publicResults, qrReceipts, receiptsRequired, notaEnabled, candidatesMayVote, administratorsMayVote,
                resultPublicationPolicy, minCandidates, campaignStart, campaignEnd, votingStart, votingEnd,
                withdrawalDeadline);
    }

    public Long getElectionId() {
        return electionId;
    }

    public int getMaxSelections() {
        return maxSelections;
    }

    public CountingMethod getCountingMethod() {
        return countingMethod;
    }

    public boolean isRequireCandidateApproval() {
        return requireCandidateApproval;
    }

    public boolean isAnonymousVoting() {
        return anonymousVoting;
    }

    public boolean isPublicResults() {
        return publicResults;
    }

    public boolean isQrReceipts() {
        return qrReceipts;
    }

    public boolean isReceiptsRequired() {
        return receiptsRequired;
    }

    public boolean isNotaEnabled() {
        return notaEnabled;
    }

    public boolean isCandidatesMayVote() {
        return candidatesMayVote;
    }

    public boolean isAdministratorsMayVote() {
        return administratorsMayVote;
    }

    public PublicationPolicy getResultPublicationPolicy() {
        return resultPublicationPolicy;
    }

    public int getMinCandidates() {
        return minCandidates;
    }

    public Instant getCampaignStart() {
        return campaignStart;
    }

    public Instant getCampaignEnd() {
        return campaignEnd;
    }

    public Instant getVotingStart() {
        return votingStart;
    }

    public Instant getVotingEnd() {
        return votingEnd;
    }

    public Instant getWithdrawalDeadline() {
        return withdrawalDeadline;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
