package com.digivote.candidate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CandidateMediaRepository extends JpaRepository<CandidateMedia, Long> {

    List<CandidateMedia> findByCandidateIdOrderByUploadedAtDesc(Long candidateId);
}
