package com.digivote.voting;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface VotingTokenRepository extends JpaRepository<VotingToken, Long> {

    Optional<VotingToken> findByElectionIdAndTokenHash(Long electionId, String tokenHash);

    long countByElectionId(Long electionId);
}
