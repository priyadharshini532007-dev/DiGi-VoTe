package com.digivote.access;

import com.digivote.organization.RoleCode;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public final class CandidateUser extends User {

    private static final Set<Permission> PERMISSIONS = EnumSet.of(Permission.APPLY_AS_CANDIDATE, Permission.CAST_VOTE);

    CandidateUser(long userId, long organizationId, String email, String fullName) {
        super(userId, organizationId, email, fullName);
    }

    @Override
    public RoleCode role() {
        return RoleCode.CANDIDATE;
    }

    @Override
    protected Set<Permission> permissions() {
        return PERMISSIONS;
    }

    @Override
    public String homePath() {
        return "/candidate";
    }

    @Override
    public List<String> dashboardSections() {
        return List.of("applications", "profile", "manifesto", "media", "timeline", "notifications", "vote");
    }

    /** A candidate votes like any voter, unless the election forbids candidates from voting in their own contest. */
    @Override
    public boolean mayVote(VotingContext context) {
        if (context.candidateInElection() && !context.candidatesMayVote()) {
            return false;
        }
        return super.mayVote(context);
    }
}
