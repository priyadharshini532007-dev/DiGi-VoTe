package com.digivote.candidate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ManifestoRepository extends JpaRepository<Manifesto, Long> {

    Optional<Manifesto> findByCandidateId(Long candidateId);

    List<Manifesto> findByCandidateIdIn(Collection<Long> candidateIds);
}
