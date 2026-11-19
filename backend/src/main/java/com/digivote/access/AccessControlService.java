package com.digivote.access;

import com.digivote.audit.SecurityEvent;
import com.digivote.audit.SecurityEventService;
import com.digivote.auth.CurrentUser;
import com.digivote.common.ApiException;
import com.digivote.election.Election;
import com.digivote.election.ElectionAdministratorRepository;
import com.digivote.election.ElectionRepository;
import com.digivote.election.state.ElectionStateMachine;
import com.digivote.organization.Membership;
import com.digivote.organization.MembershipRepository;
import com.digivote.user.UserAccount;
import com.digivote.user.UserRepository;
import com.digivote.user.UserStatus;
import org.springframework.stereotype.Service;

import java.util.EnumSet;
import java.util.Set;

/**
 * The authoritative authorization boundary. Every protected operation resolves the caller's role
 * object for the target organization from the database (never from the token or the client), checks
 * the permission, and for election-scoped operations checks that the caller operates that election.
 *
 * <p>Resources in organizations the caller does not belong to are reported as "not found" so that
 * identifiers cannot be probed (IDOR protection).
 */
@Service
public class AccessControlService {

    /** Permissions that, for elections, additionally require operating that specific election. */
    private static final Set<Permission> ELECTION_OPERATOR_PERMISSIONS =
            EnumSet.of(Permission.MANAGE_ELECTION, Permission.PUBLISH_RESULTS, Permission.ARCHIVE_ELECTION);

    private final UserRepository users;
    private final MembershipRepository memberships;
    private final ElectionRepository elections;
    private final ElectionAdministratorRepository electionAdmins;
    private final ElectionStateMachine stateMachine;
    private final UserFactory userFactory;
    private final SecurityEventService securityEvents;

    public AccessControlService(UserRepository users, MembershipRepository memberships, ElectionRepository elections,
                                ElectionAdministratorRepository electionAdmins, ElectionStateMachine stateMachine,
                                UserFactory userFactory, SecurityEventService securityEvents) {
        this.users = users;
        this.memberships = memberships;
        this.elections = elections;
        this.electionAdmins = electionAdmins;
        this.stateMachine = stateMachine;
        this.userFactory = userFactory;
        this.securityEvents = securityEvents;
    }

    public record ElectionAccess(Election election, User user, boolean operator) {
    }

    public UserAccount currentAccount() {
        UserAccount account = users.findById(CurrentUser.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));
        if (account.getStatus() != UserStatus.ACTIVE) {
            throw ApiException.forbidden("Account is not active");
        }
        return account;
    }

    /** Role object for the current account inside an organization; "not found" for non-members. */
    public User userInOrganization(Long organizationId) {
        UserAccount account = currentAccount();
        Membership membership = memberships.findByOrganizationIdAndUserId(organizationId, account.getId())
                .filter(Membership::isActive)
                .orElseGet(() -> {
                    securityEvents.record(organizationId, SecurityEvent.Type.CROSS_ORG_ACCESS,
                            SecurityEvent.Severity.MEDIUM, "user:" + account.getId(),
                            "Access to an organization without active membership");
                    throw ApiException.notFound("Organization");
                });
        return userFactory.create(account, membership);
    }

    public User require(Long organizationId, Permission permission) {
        User user = userInOrganization(organizationId);
        if (!user.can(permission)) {
            deny(user, permission.name());
        }
        return user;
    }

    /** Any active member may read an election that is visible in its current state. */
    public ElectionAccess viewElection(Long electionId) {
        Election election = elections.findById(electionId).orElseThrow(() -> ApiException.notFound("Election"));
        User user = userInOrganization(election.getOrganizationId());
        boolean operator = operates(user, election);
        boolean internal = user.can(Permission.VIEW_ELECTION_INTERNALS);
        if (!stateMachine.stateOf(election).isVisibleToMembers() && !operator && !internal) {
            throw ApiException.notFound("Election");
        }
        return new ElectionAccess(election, user, operator);
    }

    public ElectionAccess requireElection(Long electionId, Permission permission) {
        ElectionAccess access = viewElection(electionId);
        User user = access.user();
        if (!user.can(permission)) {
            deny(user, permission.name());
        }
        if (ELECTION_OPERATOR_PERMISSIONS.contains(permission) && !access.operator()) {
            deny(user, permission.name() + " on an election the user does not operate");
        }
        return access;
    }

    public boolean operates(User user, Election election) {
        boolean assigned = electionAdmins.existsByElectionIdAndUserId(election.getId(), user.userId());
        return user.can(Permission.MANAGE_ELECTION) && user.administers(assigned);
    }

    private void deny(User user, String what) {
        securityEvents.record(user.organizationId(), SecurityEvent.Type.AUTHORIZATION_DENIED,
                SecurityEvent.Severity.LOW, "user:" + user.userId(), user.role() + " denied " + what);
        throw ApiException.forbidden("Your role does not permit this action");
    }
}
