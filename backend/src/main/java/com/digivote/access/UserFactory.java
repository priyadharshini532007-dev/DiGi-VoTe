package com.digivote.access;

import com.digivote.organization.Membership;
import com.digivote.organization.RoleCode;
import com.digivote.user.UserAccount;
import org.springframework.stereotype.Component;

/**
 * Factory pattern: builds the role-specific {@link User} for an account acting within an organization.
 * Callers never instantiate role classes directly (their constructors are package-private).
 */
@Component
public class UserFactory {

    public User create(UserAccount account, Membership membership) {
        if (!membership.getUserId().equals(account.getId())) {
            throw new IllegalArgumentException("Membership does not belong to account");
        }
        return create(membership.getRole(), account.getId(), membership.getOrganizationId(),
                account.getEmail(), account.getFullName());
    }

    public User create(RoleCode role, long userId, long organizationId, String email, String fullName) {
        return switch (role) {
            case ORG_OWNER -> new OrganizationOwnerUser(userId, organizationId, email, fullName);
            case ELECTION_ADMIN -> new ElectionAdministratorUser(userId, organizationId, email, fullName);
            case CANDIDATE -> new CandidateUser(userId, organizationId, email, fullName);
            case VOTER -> new VoterUser(userId, organizationId, email, fullName);
            case AUDITOR -> new AuditorUser(userId, organizationId, email, fullName);
        };
    }
}
