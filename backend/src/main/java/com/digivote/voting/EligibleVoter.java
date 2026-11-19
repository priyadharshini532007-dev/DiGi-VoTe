package com.digivote.voting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Identity side: who may vote in which election. Never referenced from ballot data. */
@Entity
@Table(name = "eligible_voters")
public class EligibleVoter {

    public enum Status { ELIGIBLE, REMOVED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "credential_generation", nullable = false)
    private int credentialGeneration = 1;

    @Column(name = "added_by", nullable = false)
    private Long addedBy;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt;

    protected EligibleVoter() {
    }

    public EligibleVoter(Long electionId, Long userId, Long addedBy, Instant now) {
        this.electionId = electionId;
        this.userId = userId;
        this.addedBy = addedBy;
        this.addedAt = now;
        this.status = Status.ELIGIBLE;
    }

    public void remove() {
        this.status = Status.REMOVED;
    }

    public void reinstate() {
        this.status = Status.ELIGIBLE;
    }

    public int getCredentialGeneration() {
        return credentialGeneration;
    }

    public void nextCredentialGeneration() {
        this.credentialGeneration++;
    }

    public boolean isEligible() {
        return status == Status.ELIGIBLE;
    }

    public Long getId() {
        return id;
    }

    public Long getElectionId() {
        return electionId;
    }

    public Long getUserId() {
        return userId;
    }

    public Status getStatus() {
        return status;
    }

    public Instant getAddedAt() {
        return addedAt;
    }
}
