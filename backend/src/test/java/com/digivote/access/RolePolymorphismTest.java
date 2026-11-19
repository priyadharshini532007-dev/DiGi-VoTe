package com.digivote.access;

import com.digivote.organization.RoleCode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RolePolymorphismTest {

    private final UserFactory factory = new UserFactory();

    private User user(RoleCode role) {
        return factory.create(role, 1L, 10L, "a@b.test", "A");
    }

    private static User.VotingContext ctx(boolean administers, boolean candidate, boolean adminsMayVote,
                                          boolean candidatesMayVote) {
        return new User.VotingContext(administers, candidate, adminsMayVote, candidatesMayVote);
    }

    @Test
    void factoryCreatesRoleSpecificSubclasses() {
        assertThat(user(RoleCode.ORG_OWNER)).isInstanceOf(OrganizationOwnerUser.class);
        assertThat(user(RoleCode.ELECTION_ADMIN)).isInstanceOf(ElectionAdministratorUser.class);
        assertThat(user(RoleCode.CANDIDATE)).isInstanceOf(CandidateUser.class);
        assertThat(user(RoleCode.VOTER)).isInstanceOf(VoterUser.class);
        assertThat(user(RoleCode.AUDITOR)).isInstanceOf(AuditorUser.class);
        for (RoleCode r : RoleCode.values()) {
            assertThat(user(r).role()).isEqualTo(r);
            assertThat(user(r).homePath()).startsWith("/");
        }
    }

    @Test
    void permissionMatrixMatchesTheSpecification() {
        assertThat(user(RoleCode.ORG_OWNER).can(Permission.MANAGE_MEMBERS)).isTrue();
        assertThat(user(RoleCode.ELECTION_ADMIN).can(Permission.MANAGE_MEMBERS)).isFalse();
        assertThat(user(RoleCode.ELECTION_ADMIN).can(Permission.ASSIGN_ROLES)).isFalse();
        assertThat(user(RoleCode.ELECTION_ADMIN).can(Permission.MANAGE_ELECTION)).isTrue();
        assertThat(user(RoleCode.CANDIDATE).can(Permission.MANAGE_ELECTION)).isFalse();
        assertThat(user(RoleCode.CANDIDATE).can(Permission.APPLY_AS_CANDIDATE)).isTrue();
        assertThat(user(RoleCode.VOTER).can(Permission.VIEW_AUDIT_LOGS)).isFalse();
        assertThat(user(RoleCode.VOTER).can(Permission.APPLY_AS_CANDIDATE)).isFalse();
        User auditor = user(RoleCode.AUDITOR);
        assertThat(auditor.can(Permission.VERIFY_INTEGRITY)).isTrue();
        for (Permission write : new Permission[]{Permission.MANAGE_ELECTION, Permission.CREATE_ELECTION,
                Permission.PUBLISH_RESULTS, Permission.ARCHIVE_ELECTION, Permission.CAST_VOTE, Permission.MANAGE_MEMBERS}) {
            assertThat(auditor.can(write)).as(write.name()).isFalse();
        }
    }

    @Test
    void votingPolicyIsPolymorphic() {
        assertThat(user(RoleCode.VOTER).mayVote(ctx(false, false, false, true))).isTrue();
        assertThat(user(RoleCode.AUDITOR).mayVote(ctx(false, false, true, true))).isFalse();
        // owner administers every election of the organization
        User owner = user(RoleCode.ORG_OWNER);
        assertThat(owner.administers(false)).isTrue();
        assertThat(owner.mayVote(ctx(true, false, false, true))).isFalse();
        assertThat(owner.mayVote(ctx(true, false, true, true))).isTrue();
        User admin = user(RoleCode.ELECTION_ADMIN);
        assertThat(admin.administers(false)).isFalse();
        assertThat(admin.mayVote(ctx(false, false, false, true))).isTrue();
        assertThat(admin.mayVote(ctx(true, false, false, true))).isFalse();
        User candidate = user(RoleCode.CANDIDATE);
        assertThat(candidate.mayVote(ctx(false, true, false, true))).isTrue();
        assertThat(candidate.mayVote(ctx(false, true, false, false))).isFalse();
        assertThat(candidate.mayVote(ctx(false, false, false, false))).isTrue();
    }
}
