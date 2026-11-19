package com.digivote.election;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ElectionRepository extends JpaRepository<Election, Long> {

    Page<Election> findByOrganizationId(Long organizationId, Pageable pageable);

    Page<Election> findByOrganizationIdAndStatusNot(Long organizationId, ElectionStatus status, Pageable pageable);

    List<Election> findByOrganizationIdAndStatusIn(Long organizationId, Collection<ElectionStatus> statuses);

    List<Election> findByStatusIn(Collection<ElectionStatus> statuses);

    long countByOrganizationIdAndStatus(Long organizationId, ElectionStatus status);

    /** Fresh read of the status (bypasses the persistence context), used after acquiring the ballot lock. */
    @Query("select e.status from Election e where e.id = :id")
    Optional<ElectionStatus> currentStatus(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Election e where e.id = :id")
    Optional<Election> findByIdForUpdate(@Param("id") Long id);
}
