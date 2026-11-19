package com.digivote.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SecurityEventRepository extends JpaRepository<SecurityEvent, Long> {

    Page<SecurityEvent> findByOrganizationId(Long organizationId, Pageable pageable);

    long countByOrganizationIdAndEventType(Long organizationId, String eventType);

    @Query("select s.eventType, count(s) from SecurityEvent s where s.organizationId = :orgId group by s.eventType")
    List<Object[]> countByType(@Param("orgId") Long organizationId);

    @Query("select s.eventType, count(s) from SecurityEvent s where s.organizationId is null group by s.eventType")
    List<Object[]> countSystemByType();
}
