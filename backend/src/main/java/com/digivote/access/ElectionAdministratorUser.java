package com.digivote.access;

import com.digivote.organization.RoleCode;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public final class ElectionAdministratorUser extends User {

    private static final Set<Permission> PERMISSIONS = EnumSet.of(
            Permission.CREATE_ELECTION, Permission.MANAGE_ELECTION, Permission.PUBLISH_RESULTS,
            Permission.ARCHIVE_ELECTION, Permission.VIEW_ELECTION_INTERNALS, Permission.CAST_VOTE,
            Permission.VIEW_AUDIT_LOGS, Permission.GENERATE_REPORTS, Permission.VIEW_REPORTS);

    ElectionAdministratorUser(long userId, long organizationId, String email, String fullName) {
        super(userId, organizationId, email, fullName);
    }

    @Override
    public RoleCode role() {
        return RoleCode.ELECTION_ADMIN;
    }

    @Override
    protected Set<Permission> permissions() {
        return PERMISSIONS;
    }

    @Override
    public String homePath() {
        return "/admin";
    }

    @Override
    public List<String> dashboardSections() {
        return List.of("elections", "candidates", "voters", "timeline", "readiness", "results", "health");
    }

    /** Administrators operate only the elections they are assigned to. */
    @Override
    public boolean administers(boolean assignedAdministrator) {
        return assignedAdministrator;
    }
}
