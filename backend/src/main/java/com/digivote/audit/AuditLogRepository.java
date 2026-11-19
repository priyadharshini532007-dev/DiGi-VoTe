package com.digivote.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    List<AuditLog> findByChainKeyOrderBySeqAsc(String chainKey);

    Page<AuditLog> findByChainKey(String chainKey, Pageable pageable);

    Page<AuditLog> findByChainKeyAndEventTypeStartingWith(String chainKey, String prefix, Pageable pageable);

    List<AuditLog> findByElectionIdOrderBySeqAsc(Long electionId);

    long countByChainKey(String chainKey);

    @Query("select a.eventType, count(a) from AuditLog a where a.chainKey = :chainKey group by a.eventType")
    List<Object[]> countByEventType(@Param("chainKey") String chainKey);
}
