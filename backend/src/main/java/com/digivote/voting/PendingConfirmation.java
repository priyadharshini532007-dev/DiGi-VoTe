package com.digivote.voting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Marks a ballot that is not yet confirmed by its QR receipt. Deliberately carries no time and no voter. */
@Entity
@Table(name = "ballot_pending_confirmation")
public class PendingConfirmation {

    @Id
    @Column(name = "ballot_id")
    private Long ballotId;

    @Column(nullable = false)
    private boolean voided;

    protected PendingConfirmation() {
    }

    public PendingConfirmation(Long ballotId) {
        this.ballotId = ballotId;
    }

    public Long getBallotId() {
        return ballotId;
    }

    public boolean isVoided() {
        return voided;
    }

    public void voidIt() {
        this.voided = true;
    }
}
