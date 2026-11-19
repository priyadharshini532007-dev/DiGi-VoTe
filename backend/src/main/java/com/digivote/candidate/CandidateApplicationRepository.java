package com.digivote.candidate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CandidateApplicationRepository extends JpaRepository<CandidateApplication, Long> {

    List<CandidateApplication> findByElectionIdOrderBySubmittedAtAsc(Long electionId);

    List<CandidateApplication> findByUserIdOrderBySubmittedAtDesc(Long userId);

    Optional<CandidateApplication> findByElectionIdAndUserId(Long electionId, Long userId);

    long countByElectionIdAndStatus(Long electionId, CandidateApplication.Status status);
}
