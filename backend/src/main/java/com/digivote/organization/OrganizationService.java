package com.digivote.organization;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.access.User;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditLogRepository;
import com.digivote.audit.AuditService;
import com.digivote.audit.SecurityEventRepository;
import com.digivote.common.ApiException;
import com.digivote.common.Hashing;
import com.digivote.common.PageResponse;
import com.digivote.config.DigiVoteProperties;
import com.digivote.crypto.SecureTokens;
import com.digivote.election.ElectionRepository;
import com.digivote.election.ElectionStatus;
import com.digivote.auth.PasswordRecovery;
import com.digivote.auth.PasswordRecoveryRepository;
import com.digivote.user.DvNumberService;
import com.digivote.user.UserAccount;
import com.digivote.user.UserRepository;
import com.digivote.user.UserStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class OrganizationService {

    private final OrganizationRepository organizations;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final ElectionRepository elections;
    private final SecurityEventRepository securityEvents;
    private final AuditLogRepository auditLogs;
    private final AccessControlService access;
    private final AuditService audit;
    private final DigiVoteProperties properties;
    private final Clock clock;
    private final DvNumberService dvNumbers;
    private final PasswordRecoveryRepository recoveries;

    public OrganizationService(OrganizationRepository organizations, MembershipRepository memberships,
                               UserRepository users, ElectionRepository elections,
                               SecurityEventRepository securityEvents, AuditLogRepository auditLogs,
                               AccessControlService access, AuditService audit, DigiVoteProperties properties,
                               Clock clock, DvNumberService dvNumbers, PasswordRecoveryRepository recoveries) {
        this.recoveries = recoveries;
        this.dvNumbers = dvNumbers;
        this.organizations = organizations;
        this.memberships = memberships;
        this.users = users;
        this.elections = elections;
        this.securityEvents = securityEvents;
        this.auditLogs = auditLogs;
        this.access = access;
        this.audit = audit;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public OrganizationDtos.OrganizationView get(Long orgId) {
        access.userInOrganization(orgId);
        return OrganizationDtos.OrganizationView.of(load(orgId));
    }

    @Transactional
    public OrganizationDtos.OrganizationView update(Long orgId, OrganizationDtos.UpdateOrganizationRequest request) {
        User user = access.require(orgId, Permission.MANAGE_ORGANIZATION);
        Organization org = load(orgId);
        org.updateProfile(request.name().trim(), request.description(), blankToNull(request.logoUrl()),
                request.primaryColor(), clock.instant());
        if (request.type() != null) {
            org.setOrgType(request.type());
        }
        org.updateContact(blankToNull(request.contactEmail()), blankToNull(request.phone()), blankToNull(request.tagline()));
        audit.record(AuditEventType.ORG_UPDATED, orgId, null, user.userId(), Map.of("name", org.getName()));
        return OrganizationDtos.OrganizationView.of(org);
    }

    @Transactional
    public OrganizationDtos.OrganizationView updateSecurityPolicy(Long orgId, OrganizationDtos.SecurityPolicyRequest request) {
        User user = access.require(orgId, Permission.CONFIGURE_SECURITY_POLICY);
        Organization org = load(orgId);
        int lockout = request.lockoutMinutes() != null ? request.lockoutMinutes() : org.getLockoutMinutes();
        int session = request.sessionMinutes() != null ? request.sessionMinutes() : org.getSessionMinutes();
        boolean mixed = request.requireMixedCase() != null ? request.requireMixedCase() : org.isRequireMixedCase();
        org.updateSecurityPolicy(request.passwordMinLength(), request.maxFailedLogins(), lockout, session, mixed,
                clock.instant());
        audit.record(AuditEventType.ORG_SECURITY_POLICY_UPDATED, orgId, null, user.userId(),
                Map.of("passwordMinLength", request.passwordMinLength(), "maxFailedLogins", request.maxFailedLogins(),
                        "lockoutMinutes", lockout, "sessionMinutes", session, "requireMixedCase", mixed));
        return OrganizationDtos.OrganizationView.of(org);
    }

    @Transactional(readOnly = true)
    public OrganizationDtos.OverviewView overview(Long orgId) {
        access.require(orgId, Permission.VIEW_REPORTS);
        Map<String, Long> byRole = new LinkedHashMap<>();
        for (RoleCode role : RoleCode.values()) {
            byRole.put(role.name(), memberships.countByOrganizationIdAndRoleAndStatus(orgId, role, Membership.Status.ACTIVE));
        }
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (ElectionStatus status : ElectionStatus.values()) {
            byStatus.put(status.name(), elections.countByOrganizationIdAndStatus(orgId, status));
        }
        long secEvents = securityEvents.countByType(orgId).stream().mapToLong(r -> (Long) r[1]).sum();
        return new OrganizationDtos.OverviewView(OrganizationDtos.OrganizationView.of(load(orgId)), byRole, byStatus,
                secEvents, auditLogs.countByChainKey(AuditService.chainKey(orgId)),
                memberships.countByOrganizationIdAndStatus(orgId, Membership.Status.INVITED));
    }

    @Transactional(readOnly = true)
    public PageResponse<OrganizationDtos.MemberView> members(Long orgId, int page, int size) {
        User user = access.userInOrganization(orgId);
        if (!user.can(Permission.MANAGE_MEMBERS) && !user.can(Permission.MANAGE_ELECTION)
                && !user.can(Permission.VIEW_AUDIT_LOGS)) {
            throw ApiException.forbidden("Your role does not permit viewing the member directory");
        }
        Page<Membership> result = memberships.findByOrganizationIdAndStatusNot(orgId, Membership.Status.REMOVED,
                PageResponse.pageable(page, size, Sort.by("role", "createdAt")));
        return PageResponse.of(result, this::view);
    }

    @Transactional
    public OrganizationDtos.InvitationView invite(Long orgId, OrganizationDtos.InviteMemberRequest request) {
        User inviter = access.require(orgId, Permission.MANAGE_MEMBERS);
        Instant now = clock.instant();
        String email = UserAccount.normalizeEmail(request.email());
        UserAccount account = users.findByEmail(email)
                .orElseGet(() -> users.save(new UserAccount(dvNumbers.next(), email,
                        request.fullName().trim(), UserStatus.PENDING_ACTIVATION, now)));
        memberships.findByOrganizationIdAndUserId(orgId, account.getId()).ifPresent(existing -> {
            throw ApiException.conflict("ALREADY_MEMBER", "This person is already a member of the organization");
        });
        Membership membership = new Membership(orgId, account.getId(), request.role(), Membership.Status.INVITED,
                inviter.userId(), now);
        String body = SecureTokens.randomBase32(12);
        String code = body.substring(0, 4) + "-" + body.substring(4, 8) + "-" + body.substring(8);
        Instant expires = now.plus(Duration.ofHours(properties.security().activationTtlHours()));
        membership.setPendingActivation(Hashing.sha256Hex(body), expires);
        membership = memberships.save(membership);
        audit.record(AuditEventType.MEMBER_INVITED, orgId, null, inviter.userId(),
                Map.of("membershipId", membership.getId(), "role", request.role().name()));
        return new OrganizationDtos.InvitationView(view(membership), code, expires,
                properties.publicBaseUrl() + "/#/activate");
    }

    private static final Duration RECOVERY_TTL = Duration.ofHours(24);

    /**
     * Generates a one-time recovery code for a member. Refused for yourself, owners, accounts without a local password
     * and accounts that also belong to another organization (a reset would change their password everywhere).
     */
    @Transactional
    public OrganizationDtos.RecoveryView startRecovery(Long orgId, Long membershipId) {
        User actor = access.require(orgId, Permission.MANAGE_MEMBERS);
        Membership membership = loadMembership(orgId, membershipId);
        if (membership.getUserId().equals(actor.userId())) {
            throw ApiException.rule("SELF_RECOVERY", "Use \"change password\" on your profile");
        }
        if (membership.getStatus() != Membership.Status.ACTIVE) {
            throw ApiException.rule("NOT_ACTIVE", "Only active members can recover their password");
        }
        if (membership.getRole() == RoleCode.ORG_OWNER) {
            throw ApiException.rule("OWNER_RECOVERY", "An owner's password cannot be reset by another member");
        }
        UserAccount account = users.findById(membership.getUserId()).orElseThrow();
        if (account.passwordHash() == null) {
            throw ApiException.conflict("NO_LOCAL_PASSWORD", "This account signs in with Firebase and has no DIGI-VOTE password");
        }
        boolean otherOrganizations = memberships.findByUserId(account.getId()).stream()
                .anyMatch(m -> !m.getOrganizationId().equals(orgId) && m.getStatus() != Membership.Status.REMOVED);
        if (otherOrganizations) {
            throw ApiException.rule("SHARED_ACCOUNT", "This account belongs to more than one organization; the member must reset it themselves");
        }
        Instant now = clock.instant();
        recoveries.findByUserIdAndUsedAtIsNull(account.getId()).forEach(r -> r.markUsed(now));
        String body = SecureTokens.randomBase32(12);
        String code = body.substring(0, 4) + "-" + body.substring(4, 8) + "-" + body.substring(8);
        Instant expires = now.plus(RECOVERY_TTL);
        recoveries.save(new PasswordRecovery(account.getId(), orgId, Hashing.sha256Hex(body), expires, actor.userId(), now));
        audit.record(AuditEventType.AUTH_RECOVERY_STARTED, orgId, null, actor.userId(), Map.of("membershipId", membershipId));
        return new OrganizationDtos.RecoveryView(code, expires, properties.publicBaseUrl() + "/#/recover");
    }

    @Transactional
    public OrganizationDtos.MemberView changeRole(Long orgId, Long membershipId, RoleCode role) {
        User owner = access.require(orgId, Permission.ASSIGN_ROLES);
        Membership membership = loadMembership(orgId, membershipId);
        if (membership.getUserId().equals(owner.userId())) {
            throw ApiException.rule("SELF_ROLE_CHANGE", "You cannot change your own role");
        }
        if (membership.getRole() == RoleCode.ORG_OWNER && role != RoleCode.ORG_OWNER) {
            requireAnotherOwner(orgId);
        }
        RoleCode previous = membership.getRole();
        membership.changeRole(role, clock.instant());
        audit.record(AuditEventType.MEMBER_ROLE_CHANGED, orgId, null, owner.userId(),
                Map.of("membershipId", membershipId, "from", previous.name(), "to", role.name()));
        return view(membership);
    }

    @Transactional
    public OrganizationDtos.MemberView changeStatus(Long orgId, Long membershipId, Membership.Status status) {
        User owner = access.require(orgId, Permission.MANAGE_MEMBERS);
        Membership membership = loadMembership(orgId, membershipId);
        if (membership.getUserId().equals(owner.userId())) {
            throw ApiException.rule("SELF_STATUS_CHANGE", "You cannot suspend or remove yourself");
        }
        if (status == Membership.Status.INVITED) {
            throw ApiException.badRequest("INVALID_STATUS", "Use an invitation to add members");
        }
        if (membership.getStatus() == Membership.Status.INVITED && status == Membership.Status.ACTIVE) {
            throw ApiException.rule("NOT_ACTIVATED", "The member must accept the invitation first");
        }
        if (membership.getRole() == RoleCode.ORG_OWNER && status != Membership.Status.ACTIVE) {
            requireAnotherOwner(orgId);
        }
        Membership.Status previous = membership.getStatus();
        membership.changeStatus(status, clock.instant());
        audit.record(AuditEventType.MEMBER_STATUS_CHANGED, orgId, null, owner.userId(),
                Map.of("membershipId", membershipId, "from", previous.name(), "to", status.name()));
        return view(membership);
    }

    private void requireAnotherOwner(Long orgId) {
        if (memberships.countByOrganizationIdAndRoleAndStatus(orgId, RoleCode.ORG_OWNER, Membership.Status.ACTIVE) < 2) {
            throw ApiException.rule("LAST_OWNER", "An organization must keep at least one active owner");
        }
    }

    private Membership loadMembership(Long orgId, Long membershipId) {
        return memberships.findById(membershipId)
                .filter(m -> m.getOrganizationId().equals(orgId))
                .orElseThrow(() -> ApiException.notFound("Member"));
    }

    private Organization load(Long orgId) {
        return organizations.findById(orgId).orElseThrow(() -> ApiException.notFound("Organization"));
    }

    private OrganizationDtos.MemberView view(Membership m) {
        UserAccount u = users.findById(m.getUserId()).orElseThrow();
        return new OrganizationDtos.MemberView(m.getId(), u.getId(), u.getEmail(), u.getFullName(), m.getRole(),
                m.getStatus().name(), m.getCreatedAt(), u.getLastLoginAt());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
