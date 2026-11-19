package com.digivote.voting;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface VoteRepository extends JpaRepository<Vote, Long> {

    List<Vote> findByBallotIdOrderByOptionIndexAsc(Long ballotId);

    @Query("select v from Vote v where v.ballotId in (select b.id from Ballot b where b.electionId = :electionId) "
            + "and not exists (select p.ballotId from PendingConfirmation p where p.ballotId = v.ballotId) "
            + "order by v.ballotId, v.optionIndex")
    List<Vote> findAllForElection(@Param("electionId") Long electionId);
}
