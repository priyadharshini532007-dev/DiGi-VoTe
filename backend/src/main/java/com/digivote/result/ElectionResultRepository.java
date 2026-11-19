package com.digivote.result;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ElectionResultRepository extends JpaRepository<ElectionResult, Long> {

    Optional<ElectionResult> findByElectionId(Long electionId);
}
