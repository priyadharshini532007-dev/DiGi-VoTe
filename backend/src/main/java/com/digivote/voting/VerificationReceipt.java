package com.digivote.voting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.hibernate.annotations.Immutable;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;

/**
 * Receipt record. Only the SHA-256 of the receipt code is stored; the code itself is held by the voter.
 * Random id; no issue time for new receipts.
 */
@Entity
@Immutable
@Table(name = "verification_receipts")
public class VerificationReceipt implements Persistable<Long> {

    @Id
    private Long id;

    @Transient
    private boolean fresh;

    @Column(name = "ballot_id", nullable = false)
    private Long ballotId;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Column(name = "receipt_code_hash", nullable = false)
    private String receiptCodeHash;

    /** Historic rows only; not written for new receipts (timing correlation). */
    @Column(name = "issued_at_minute")
    private LocalDateTime issuedAtMinute;

    protected VerificationReceipt() {
    }

    public VerificationReceipt(Long ballotId, Long electionId, String receiptCodeHash) {
        this.id = AnonymousIds.next();
        this.fresh = true;
        this.ballotId = ballotId;
        this.electionId = electionId;
        this.receiptCodeHash = receiptCodeHash;
    }

    @Override
    public Long getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return fresh;
    }

    public Long getBallotId() {
        return ballotId;
    }

    public Long getElectionId() {
        return electionId;
    }

    public String getReceiptCodeHash() {
        return receiptCodeHash;
    }

    public LocalDateTime getIssuedAtMinute() {
        return issuedAtMinute;
    }
}
