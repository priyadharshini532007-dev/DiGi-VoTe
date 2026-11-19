package com.digivote.organization;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MembershipRepository extends JpaRepository<Membership, Long> {

    Optional<Membership> findByOrganizationIdAndUserId(Long organizationId, Long userId);

    List<Membership> findByUserId(Long userId);

    Page<Membership> findByOrganizationIdAndStatusNot(Long organizationId, Membership.Status status, Pageable pageable);

    List<Membership> findByOrganizationIdAndRoleAndStatus(Long organizationId, RoleCode role, Membership.Status status);

    long countByOrganizationIdAndStatus(Long organizationId, Membership.Status status);

    long countByOrganizationIdAndRoleAndStatus(Long organizationId, RoleCode role, Membership.Status status);

    List<Membership> findByOrganizationIdAndUserIdIn(Long organizationId, Collection<Long> userIds);
}
