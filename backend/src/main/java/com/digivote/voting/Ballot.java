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
 * Anonymous side: an accepted ballot. It holds no voter id, email, account or credential reference.
 * New ballots get a random id and store neither an acceptance time nor a selection count, so nothing in
 * the row reflects when, or in which order, it was cast (historic rows keep their old values).
 */
@Entity
@Immutable
@Table(name = "ballots")
public class Ballot implements Persistable<Long> {

    @Id
    private Long id;

    @Transient
    private boolean fresh;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Column(name = "ballot_commitment", nullable = false)
    private String ballotCommitment;

    /** Historic rows only; not written for new ballots (would reveal how many options a voter chose). */
    @Column(name = "selection_count")
    private Integer selectionCount;

    /** Historic rows only; not written for new ballots (timing correlation). */
    @Column(name = "accepted_at_minute")
    private LocalDateTime acceptedAtMinute;

    protected Ballot() {
    }

    public Ballot(Long electionId, String ballotCommitment) {
        this.id = AnonymousIds.next();
        this.fresh = true;
        this.electionId = electionId;
        this.ballotCommitment = ballotCommitment;
    }

    @Override
    public Long getId() {
        return id;
    }

    /** Ids are assigned randomly, so persistence is told explicitly that a new row is new. */
    @Override
    public boolean isNew() {
        return fresh;
    }

    public Long getElectionId() {
        return electionId;
    }

    public String getBallotCommitment() {
        return ballotCommitment;
    }

    public Integer getSelectionCount() {
        return selectionCount;
    }

    public LocalDateTime getAcceptedAtMinute() {
        return acceptedAtMinute;
    }
}
