package com.digivote.voting;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface VotingCredentialRepository extends JpaRepository<VotingCredential, Long> {

    Optional<VotingCredential> findByEligibleVoterIdAndGeneration(Long eligibleVoterId, int generation);

    boolean existsByEligibleVoterId(Long eligibleVoterId);

    List<VotingCredential> findByEligibleVoterIdIn(Collection<Long> eligibleVoterIds);

    long countByElectionId(Long electionId);
}
