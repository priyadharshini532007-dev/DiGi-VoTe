package com.digivote.result;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ElectionResultItemRepository extends JpaRepository<ElectionResultItem, Long> {

    List<ElectionResultItem> findByResultIdOrderByOptionIndexAsc(Long resultId);

    @Modifying
    @Query("delete from ElectionResultItem i where i.resultId = :resultId")
    void deleteByResultId(@Param("resultId") Long resultId);
}
