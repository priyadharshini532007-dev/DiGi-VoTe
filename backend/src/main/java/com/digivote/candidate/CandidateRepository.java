package com.digivote.candidate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CandidateRepository extends JpaRepository<Candidate, Long> {

    List<Candidate> findByElectionIdOrderByBallotPositionAsc(Long electionId);

    List<Candidate> findByElectionIdAndStatusOrderByBallotPositionAsc(Long electionId, Candidate.Status status);

    Optional<Candidate> findByApplicationId(Long applicationId);

    Optional<Candidate> findByElectionIdAndUserId(Long electionId, Long userId);

    boolean existsByElectionIdAndUserIdAndStatus(Long electionId, Long userId, Candidate.Status status);

    long countByElectionIdAndStatus(Long electionId, Candidate.Status status);

    @Query("select coalesce(max(c.ballotPosition), 0) from Candidate c where c.electionId = :electionId")
    int maxBallotPosition(@Param("electionId") Long electionId);
}
