package com.digivote.voting;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ElectionKeysRepository extends JpaRepository<ElectionKeys, Long> {

    /** Row lock that serializes ballot acceptance per election (bulletin board ordering). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select k from ElectionKeys k where k.electionId = :electionId")
    Optional<ElectionKeys> lockForBallot(@Param("electionId") Long electionId);
}
