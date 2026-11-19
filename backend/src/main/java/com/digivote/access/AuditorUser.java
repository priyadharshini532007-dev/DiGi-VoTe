package com.digivote.access;

import com.digivote.organization.RoleCode;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/** Read-only inspector: no permission that changes election data, and never a voter. */
public final class AuditorUser extends User {

    private static final Set<Permission> PERMISSIONS = EnumSet.of(
            Permission.VIEW_ELECTION_INTERNALS, Permission.VIEW_AUDIT_LOGS, Permission.VERIFY_INTEGRITY,
            Permission.VIEW_SECURITY_EVENTS, Permission.GENERATE_REPORTS, Permission.VIEW_REPORTS);

    AuditorUser(long userId, long organizationId, String email, String fullName) {
        super(userId, organizationId, email, fullName);
    }

    @Override
    public RoleCode role() {
        return RoleCode.AUDITOR;
    }

    @Override
    protected Set<Permission> permissions() {
        return PERMISSIONS;
    }

    @Override
    public String homePath() {
        return "/auditor";
    }

    @Override
    public List<String> dashboardSections() {
        return List.of("overview", "bulletin", "integrity", "timeline", "receipts", "security", "reports", "archive");
    }

    @Override
    public boolean mayVote(VotingContext context) {
        return false;
    }
}
