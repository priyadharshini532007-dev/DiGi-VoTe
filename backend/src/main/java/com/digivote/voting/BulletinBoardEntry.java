package com.digivote.voting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.LocalDateTime;

/**
 * Public, hash-chained record of an accepted ballot:
 * entry_hash = SHA-256("DIGI-VOTE-BB-v1|" + electionId + "|" + seq + "|" + commitment + "|" + prevHash).
 */
@Entity
@Immutable
@Table(name = "bulletin_board_entries")
public class BulletinBoardEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Column(nullable = false)
    private int seq;

    @Column(name = "ballot_id", nullable = false)
    private Long ballotId;

    @Column(name = "ballot_commitment", nullable = false)
    private String ballotCommitment;

    @Column(name = "prev_hash", nullable = false)
    private String prevHash;

    @Column(name = "entry_hash", nullable = false)
    private String entryHash;

    @Column(name = "posted_at_minute", nullable = false)
    private LocalDateTime postedAtMinute;

    protected BulletinBoardEntry() {
    }

    public BulletinBoardEntry(Long electionId, int seq, Long ballotId, String ballotCommitment, String prevHash,
                              String entryHash, LocalDateTime postedAtMinute) {
        this.electionId = electionId;
        this.seq = seq;
        this.ballotId = ballotId;
        this.ballotCommitment = ballotCommitment;
        this.prevHash = prevHash;
        this.entryHash = entryHash;
        this.postedAtMinute = postedAtMinute;
    }

    public Long getElectionId() {
        return electionId;
    }

    public int getSeq() {
        return seq;
    }

    public Long getBallotId() {
        return ballotId;
    }

    public String getBallotCommitment() {
        return ballotCommitment;
    }

    public String getPrevHash() {
        return prevHash;
    }

    public String getEntryHash() {
        return entryHash;
    }

    public LocalDateTime getPostedAtMinute() {
        return postedAtMinute;
    }
}
