package com.digivote.access;

import com.digivote.organization.RoleCode;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public final class VoterUser extends User {

    private static final Set<Permission> PERMISSIONS = EnumSet.of(Permission.CAST_VOTE);

    VoterUser(long userId, long organizationId, String email, String fullName) {
        super(userId, organizationId, email, fullName);
    }

    @Override
    public RoleCode role() {
        return RoleCode.VOTER;
    }

    @Override
    protected Set<Permission> permissions() {
        return PERMISSIONS;
    }

    @Override
    public String homePath() {
        return "/voter";
    }

    @Override
    public List<String> dashboardSections() {
        return List.of("elections", "candidates", "ballot", "receipts", "results", "notifications");
    }
}
