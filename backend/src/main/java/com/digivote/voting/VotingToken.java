package com.digivote.voting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.hibernate.annotations.Immutable;
import org.springframework.data.domain.Persistable;

/**
 * Anonymous side: a redeemed (spent) blind-signed token. UNIQUE(election_id, token_hash) makes a second
 * redemption of the same token impossible at the database level. Random id.
 */
@Entity
@Immutable
@Table(name = "voting_tokens")
public class VotingToken implements Persistable<Long> {

    @Id
    private Long id;

    @Transient
    private boolean fresh;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Column(name = "token_hash", nullable = false)
    private String tokenHash;

    @Column(name = "submission_nonce_hash", nullable = false)
    private String submissionNonceHash;

    @Column(name = "ballot_id", nullable = false)
    private Long ballotId;

    protected VotingToken() {
    }

    public VotingToken(Long electionId, String tokenHash, String submissionNonceHash, Long ballotId) {
        this.id = AnonymousIds.next();
        this.fresh = true;
        this.electionId = electionId;
        this.tokenHash = tokenHash;
        this.submissionNonceHash = submissionNonceHash;
        this.ballotId = ballotId;
    }

    @Override
    public Long getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return fresh;
    }

    public Long getElectionId() {
        return electionId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public String getSubmissionNonceHash() {
        return submissionNonceHash;
    }

    public Long getBallotId() {
        return ballotId;
    }
}
