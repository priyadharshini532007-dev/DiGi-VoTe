package com.digivote.voting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/**
 * Identity side record that a blind signature was issued to an eligible voter. It stores only the
 * hash of the blinded request and the blinded signature (both statistically independent of the
 * unblinded token later spent), which lets an interrupted client safely retry the same request.
 */
@Entity
@Immutable
@Table(name = "voting_credentials")
public class VotingCredential {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "eligible_voter_id", nullable = false)
    private Long eligibleVoterId;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Column(name = "blinded_request_hash", nullable = false)
    private String blindedRequestHash;

    @Column(name = "blind_signature", nullable = false)
    private String blindSignature;

    @Column(name = "key_fingerprint", nullable = false)
    private String keyFingerprint;

    @Column(nullable = false)
    private int generation = 1;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    protected VotingCredential() {
    }

    public VotingCredential(Long eligibleVoterId, Long electionId, String blindedRequestHash, String blindSignature,
                            String keyFingerprint, Instant issuedAt) {
        this.eligibleVoterId = eligibleVoterId;
        this.electionId = electionId;
        this.blindedRequestHash = blindedRequestHash;
        this.blindSignature = blindSignature;
        this.keyFingerprint = keyFingerprint;
        this.issuedAt = issuedAt;
    }

    public Long getId() {
        return id;
    }

    public int getGeneration() {
        return generation;
    }

    public void setGeneration(int generation) {
        this.generation = generation;
    }

    public Long getEligibleVoterId() {
        return eligibleVoterId;
    }

    public Long getElectionId() {
        return electionId;
    }

    public String getBlindedRequestHash() {
        return blindedRequestHash;
    }

    public String getBlindSignature() {
        return blindSignature;
    }

    public String getKeyFingerprint() {
        return keyFingerprint;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }
}
