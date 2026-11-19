package com.digivote.election;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StateTransitionRepository extends JpaRepository<StateTransition, Long> {

    List<StateTransition> findByElectionIdOrderByOccurredAtAscIdAsc(Long electionId);
}
