package com.digivote.election;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ElectionAdministratorRepository extends JpaRepository<ElectionAdministrator, ElectionAdministrator.Key> {

    boolean existsByElectionIdAndUserId(Long electionId, Long userId);

    List<ElectionAdministrator> findByElectionId(Long electionId);

    List<ElectionAdministrator> findByUserId(Long userId);
}
