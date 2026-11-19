package com.digivote.result;

import com.digivote.common.ApiException;
import com.digivote.election.CountingMethod;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Tally outcome. Once PUBLISHED every mutator refuses (and trigger trg_results_published_immutable backs it up). */
@Entity
@Table(name = "election_results")
public class ElectionResult {

    public enum Status { GENERATED, PUBLISHED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(name = "counting_method", nullable = false)
    private CountingMethod countingMethod;

    @Column(name = "accepted_ballots", nullable = false)
    private int acceptedBallots;

    @Column(name = "total_selections", nullable = false)
    private int totalSelections;

    @Column(name = "bulletin_head_hash", nullable = false)
    private String bulletinHeadHash;

    @Column(name = "tie_detected", nullable = false)
    private boolean tieDetected;

    @Column(name = "result_hash", nullable = false)
    private String resultHash;

    @Column(name = "generated_by", nullable = false)
    private Long generatedBy;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    @Column(name = "generation_count", nullable = false)
    private int generationCount;

    @Column(name = "published_by")
    private Long publishedBy;

    @Column(name = "published_at")
    private Instant publishedAt;

    protected ElectionResult() {
    }

    public ElectionResult(Long electionId, CountingMethod method, Long generatedBy, Instant now) {
        this.electionId = electionId;
        this.countingMethod = method;
        this.status = Status.GENERATED;
        this.generatedBy = generatedBy;
        this.generatedAt = now;
        this.generationCount = 0;
    }

    public void record(int acceptedBallots, int totalSelections, String bulletinHeadHash, boolean tie,
                       String resultHash, Long generatedBy, Instant now) {
        requireMutable();
        this.acceptedBallots = acceptedBallots;
        this.totalSelections = totalSelections;
        this.bulletinHeadHash = bulletinHeadHash;
        this.tieDetected = tie;
        this.resultHash = resultHash;
        this.generatedBy = generatedBy;
        this.generatedAt = now;
        this.generationCount++;
    }

    public void publish(Long userId, Instant now) {
        requireMutable();
        this.status = Status.PUBLISHED;
        this.publishedBy = userId;
        this.publishedAt = now;
    }

    private void requireMutable() {
        if (status == Status.PUBLISHED) {
            throw ApiException.conflict("RESULTS_PUBLISHED", "Published results cannot be modified");
        }
    }

    public Long getId() {
        return id;
    }

    public Long getElectionId() {
        return electionId;
    }

    public Status getStatus() {
        return status;
    }

    public CountingMethod getCountingMethod() {
        return countingMethod;
    }

    public int getAcceptedBallots() {
        return acceptedBallots;
    }

    public int getTotalSelections() {
        return totalSelections;
    }

    public String getBulletinHeadHash() {
        return bulletinHeadHash;
    }

    public boolean isTieDetected() {
        return tieDetected;
    }

    public String getResultHash() {
        return resultHash;
    }

    public Instant getGeneratedAt() {
        return generatedAt;
    }

    public int getGenerationCount() {
        return generationCount;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }
}
