package com.digivote.voting;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BallotRepository extends JpaRepository<Ballot, Long> {

    long countByElectionId(Long electionId);

    List<Ballot> findByElectionId(Long electionId);

    Optional<Ballot> findByBallotCommitment(String commitment);

    /** Ballots that count: every ballot except those still waiting for (or denied) QR confirmation. */
    @Query("select b from Ballot b where b.electionId = :electionId and not exists "
            + "(select p.ballotId from PendingConfirmation p where p.ballotId = b.id)")
    List<Ballot> findConfirmed(@Param("electionId") Long electionId);

    @Query("select count(b) from Ballot b where b.electionId = :electionId and not exists "
            + "(select p.ballotId from PendingConfirmation p where p.ballotId = b.id)")
    long countConfirmed(@Param("electionId") Long electionId);

    /** Accepted ballots not yet appended to the bulletin board (awaiting a shuffled batch). */
    @Query("select b from Ballot b where b.electionId = :electionId and not exists "
            + "(select e.id from BulletinBoardEntry e where e.ballotId = b.id) and not exists "
            + "(select p.ballotId from PendingConfirmation p where p.ballotId = b.id)")
    List<Ballot> findUnpublished(@Param("electionId") Long electionId);

    @Query("select count(b) from Ballot b where b.electionId = :electionId and not exists "
            + "(select e.id from BulletinBoardEntry e where e.ballotId = b.id) and not exists "
            + "(select p.ballotId from PendingConfirmation p where p.ballotId = b.id)")
    long countUnpublished(@Param("electionId") Long electionId);
}
