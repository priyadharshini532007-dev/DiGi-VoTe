package com.digivote.voting;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface EligibleVoterRepository extends JpaRepository<EligibleVoter, Long> {

    Page<EligibleVoter> findByElectionId(Long electionId, Pageable pageable);

    Optional<EligibleVoter> findByElectionIdAndUserId(Long electionId, Long userId);

    List<EligibleVoter> findByUserIdAndStatus(Long userId, EligibleVoter.Status status);

    long countByElectionIdAndStatus(Long electionId, EligibleVoter.Status status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from EligibleVoter v where v.electionId = :electionId and v.userId = :userId")
    Optional<EligibleVoter> lockByElectionIdAndUserId(@Param("electionId") Long electionId, @Param("userId") Long userId);
}
