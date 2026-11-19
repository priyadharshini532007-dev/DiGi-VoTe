package com.digivote.access;

import com.digivote.organization.RoleCode;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public final class OrganizationOwnerUser extends User {

    private static final Set<Permission> PERMISSIONS = EnumSet.of(
            Permission.MANAGE_ORGANIZATION, Permission.MANAGE_MEMBERS, Permission.ASSIGN_ROLES,
            Permission.CONFIGURE_SECURITY_POLICY, Permission.CREATE_ELECTION, Permission.MANAGE_ELECTION,
            Permission.ASSIGN_ELECTION_ADMINS, Permission.PUBLISH_RESULTS, Permission.ARCHIVE_ELECTION,
            Permission.VIEW_ELECTION_INTERNALS, Permission.CAST_VOTE, Permission.VIEW_AUDIT_LOGS,
            Permission.VERIFY_INTEGRITY, Permission.VIEW_SECURITY_EVENTS, Permission.GENERATE_REPORTS,
            Permission.VIEW_REPORTS);

    OrganizationOwnerUser(long userId, long organizationId, String email, String fullName) {
        super(userId, organizationId, email, fullName);
    }

    @Override
    public RoleCode role() {
        return RoleCode.ORG_OWNER;
    }

    @Override
    protected Set<Permission> permissions() {
        return PERMISSIONS;
    }

    @Override
    public String homePath() {
        return "/owner";
    }

    @Override
    public List<String> dashboardSections() {
        return List.of("overview", "organization", "members", "elections", "reports", "audit", "security");
    }

    /** The owner oversees every election of the organization. */
    @Override
    public boolean administers(boolean assignedAdministrator) {
        return true;
    }
}
