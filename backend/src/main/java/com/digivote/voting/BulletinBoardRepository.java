package com.digivote.voting;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BulletinBoardRepository extends JpaRepository<BulletinBoardEntry, Long> {

    Optional<BulletinBoardEntry> findTopByElectionIdOrderBySeqDesc(Long electionId);

    Optional<BulletinBoardEntry> findByBallotId(Long ballotId);

    List<BulletinBoardEntry> findByElectionIdOrderBySeqAsc(Long electionId);

    Page<BulletinBoardEntry> findByElectionId(Long electionId, Pageable pageable);

    long countByElectionId(Long electionId);
}
