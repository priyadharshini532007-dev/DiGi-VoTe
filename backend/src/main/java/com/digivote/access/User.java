package com.digivote.access;

import com.digivote.organization.RoleCode;

import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * Abstract DIGI-VOTE user acting inside one organization (OOPS: abstraction + inheritance).
 *
 * <p>Each role is a subclass that supplies its own permission set, landing page, dashboard
 * sections and voting policy (polymorphism). Instances are created only by {@link UserFactory}
 * from the persisted account and membership, and their state is immutable (encapsulation).
 */
public abstract class User {

    private final long userId;
    private final long organizationId;
    private final String email;
    private final String fullName;

    protected User(long userId, long organizationId, String email, String fullName) {
        this.userId = userId;
        this.organizationId = organizationId;
        this.email = email;
        this.fullName = fullName;
    }

    public abstract RoleCode role();

    /** Permissions granted by this role, independent of any specific election. */
    protected abstract Set<Permission> permissions();

    /** Route the frontend opens after login for this role. */
    public abstract String homePath();

    /** Dashboard sections rendered for this role. */
    public abstract List<String> dashboardSections();

    public final boolean can(Permission permission) {
        return permissions().contains(permission);
    }

    public final Set<Permission> grantedPermissions() {
        return Collections.unmodifiableSet(permissions());
    }

    /**
     * Whether this user may obtain a voting credential, given the election's persisted rules and the
     * user's relationship to that election. Subclasses tighten the default policy.
     */
    public boolean mayVote(VotingContext context) {
        if (!can(Permission.CAST_VOTE)) {
            return false;
        }
        return !context.administersElection() || context.administratorsMayVote();
    }

    /** Whether this user operates the given election (owner of its organization or an assigned administrator). */
    public boolean administers(boolean assignedAdministrator) {
        return false;
    }

    public long userId() {
        return userId;
    }

    public long organizationId() {
        return organizationId;
    }

    public String email() {
        return email;
    }

    public String fullName() {
        return fullName;
    }

    /** Election-specific facts used by {@link #mayVote(VotingContext)}. */
    public record VotingContext(boolean administersElection, boolean candidateInElection,
                                boolean administratorsMayVote, boolean candidatesMayVote) {
    }
}
