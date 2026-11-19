package com.digivote.voting;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.access.User;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.candidate.Candidate;
import com.digivote.candidate.CandidateRepository;
import com.digivote.common.ApiException;
import com.digivote.common.PageResponse;
import com.digivote.election.Election;
import com.digivote.election.ElectionRule;
import com.digivote.election.ElectionRuleRepository;
import com.digivote.election.rules.RuleEngine;
import com.digivote.election.state.ElectionStateMachine;
import com.digivote.organization.Membership;
import com.digivote.organization.MembershipRepository;
import com.digivote.organization.RoleCode;
import com.digivote.user.UserAccount;
import com.digivote.user.UserRepository;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Identity side: maintains the eligible voter list and answers "may this person vote?". */
@Service
public class EligibilityService {

    private final EligibleVoterRepository voters;
    private final VotingCredentialRepository credentials;
    private final UserRepository users;
    private final MembershipRepository memberships;
    private final CandidateRepository candidates;
    private final ElectionRuleRepository rules;
    private final AccessControlService access;
    private final ElectionStateMachine stateMachine;
    private final RuleEngine ruleEngine;
    private final AuditService audit;
    private final Clock clock;

    public EligibilityService(EligibleVoterRepository voters, VotingCredentialRepository credentials,
                              UserRepository users, MembershipRepository memberships, CandidateRepository candidates,
                              ElectionRuleRepository rules, AccessControlService access,
                              ElectionStateMachine stateMachine, RuleEngine ruleEngine, AuditService audit,
                              Clock clock) {
        this.voters = voters;
        this.credentials = credentials;
        this.users = users;
        this.memberships = memberships;
        this.candidates = candidates;
        this.rules = rules;
        this.access = access;
        this.stateMachine = stateMachine;
        this.ruleEngine = ruleEngine;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public VotingDtos.AddVotersResult addVoters(Long electionId, List<String> emails) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.MANAGE_ELECTION);
        Election election = a.election();
        stateMachine.require(stateMachine.stateOf(election).allowsVoterListChanges(), election, "change the voter list");
        Instant now = clock.instant();
        int added = 0;
        int existing = 0;
        List<String> rejected = new ArrayList<>();
        for (String raw : emails.stream().map(UserAccount::normalizeEmail).distinct().toList()) {
            Optional<UserAccount> user = users.findByEmail(raw);
            Optional<Membership> membership = user.flatMap(u ->
                    memberships.findByOrganizationIdAndUserId(election.getOrganizationId(), u.getId()));
            if (membership.isEmpty() || membership.get().getStatus() == Membership.Status.REMOVED
                    || membership.get().getStatus() == Membership.Status.SUSPENDED) {
                rejected.add(raw + ": not an active or invited member of this organization");
                continue;
            }
            if (membership.get().getRole() == RoleCode.AUDITOR) {
                rejected.add(raw + ": auditors cannot vote");
                continue;
            }
            Optional<EligibleVoter> current = voters.findByElectionIdAndUserId(electionId, user.get().getId());
            if (current.isPresent()) {
                if (current.get().isEligible()) {
                    existing++;
                } else {
                    current.get().reinstate();
                    added++;
                }
                continue;
            }
            voters.save(new EligibleVoter(electionId, user.get().getId(), a.user().userId(), now));
            added++;
        }
        audit.record(AuditEventType.VOTERS_ADDED, election.getOrganizationId(), electionId, a.user().userId(),
                Map.of("added", added, "rejected", rejected.size()));
        return new VotingDtos.AddVotersResult(added, existing, rejected);
    }

    /** Adds every active member holding the VOTER or CANDIDATE role. */
    @Transactional
    public VotingDtos.AddVotersResult addAllMembers(Long electionId) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.MANAGE_ELECTION);
        List<String> emails = new ArrayList<>();
        for (RoleCode role : List.of(RoleCode.VOTER, RoleCode.CANDIDATE)) {
            memberships.findByOrganizationIdAndRoleAndStatus(a.election().getOrganizationId(), role,
                    Membership.Status.ACTIVE).forEach(m -> users.findById(m.getUserId())
                    .ifPresent(u -> emails.add(u.getEmail())));
        }
        if (emails.isEmpty()) {
            return new VotingDtos.AddVotersResult(0, 0, List.of("No active voters or candidates in the organization"));
        }
        return addVoters(electionId, emails);
    }

    @Transactional
    public void removeVoter(Long electionId, Long eligibleVoterId) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.MANAGE_ELECTION);
        stateMachine.require(stateMachine.stateOf(a.election()).allowsVoterListChanges(), a.election(),
                "change the voter list");
        EligibleVoter voter = voters.findById(eligibleVoterId).filter(v -> v.getElectionId().equals(electionId))
                .orElseThrow(() -> ApiException.notFound("Eligible voter"));
        if (credentials.existsByEligibleVoterId(voter.getId())) {
            throw ApiException.conflict("CREDENTIAL_ISSUED", "A credential was already issued to this voter");
        }
        voter.remove();
        audit.record(AuditEventType.VOTER_REMOVED, a.election().getOrganizationId(), electionId, a.user().userId(),
                Map.of("eligibleVoterId", eligibleVoterId));
    }

    @Transactional(readOnly = true)
    public PageResponse<VotingDtos.EligibleVoterView> list(Long electionId, int page, int size) {
        access.requireElection(electionId, Permission.VIEW_ELECTION_INTERNALS);
        var result = voters.findByElectionId(electionId, PageResponse.pageable(page, size, Sort.by("addedAt")));
        java.util.Map<Long, Integer> generations = new java.util.HashMap<>();
        result.getContent().forEach(v -> generations.put(v.getId(), v.getCredentialGeneration()));
        var issued = credentials.findByEligibleVoterIdIn(generations.keySet()).stream()
                .filter(c -> c.getGeneration() == generations.get(c.getEligibleVoterId()))
                .map(VotingCredential::getEligibleVoterId).toList();
        Long orgId = access.viewElection(electionId).election().getOrganizationId();
        return PageResponse.of(result, v -> {
            UserAccount u = users.findById(v.getUserId()).orElseThrow();
            String role = memberships.findByOrganizationIdAndUserId(orgId, u.getId())
                    .map(m -> m.getRole().name()).orElse("-");
            return new VotingDtos.EligibleVoterView(v.getId(), u.getId(), u.getFullName(), u.getEmail(), role,
                    v.getStatus().name(), issued.contains(v.getId()), v.getAddedAt());
        });
    }

    /** Result of the eligibility evaluation for one user and election. */
    public record Decision(boolean eligible, boolean mayVote, boolean votingOpen, Optional<EligibleVoter> voter,
                           List<String> reasons) {
    }

    @Transactional(readOnly = true)
    public Decision evaluate(Election election, User user) {
        ElectionRule rule = rules.findById(election.getId()).orElseThrow();
        List<String> reasons = new ArrayList<>();
        Optional<EligibleVoter> voter = voters.findByElectionIdAndUserId(election.getId(), user.userId())
                .filter(EligibleVoter::isEligible);
        if (voter.isEmpty()) {
            reasons.add("You are not on the eligible voter list for this election");
        }
        boolean operator = access.operates(user, election);
        boolean isCandidate = candidates.existsByElectionIdAndUserIdAndStatus(election.getId(), user.userId(),
                Candidate.Status.ACTIVE);
        boolean roleAllows = user.mayVote(new User.VotingContext(operator, isCandidate,
                rule.isAdministratorsMayVote(), rule.isCandidatesMayVote()));
        if (!roleAllows) {
            reasons.add(operator ? "You administer this election and its rules do not allow administrators to vote"
                    : isCandidate ? "Candidates may not vote in this election"
                    : "Your role (" + user.role() + ") cannot vote");
        }
        Instant now = clock.instant();
        boolean open = stateMachine.stateOf(election).acceptsBallots() && ruleEngine.votingWindowOpen(rule, now);
        if (!open) {
            reasons.add("Voting is not open");
        }
        return new Decision(voter.isPresent(), voter.isPresent() && roleAllows, open, voter, reasons);
    }

    @Transactional(readOnly = true)
    public VotingDtos.EligibilityView myEligibility(Long electionId) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        Decision d = evaluate(a.election(), a.user());
        boolean issued = d.voter().flatMap(v -> credentials.findByEligibleVoterIdAndGeneration(v.getId(),
                v.getCredentialGeneration())).isPresent();
        return new VotingDtos.EligibilityView(electionId, d.eligible(), d.mayVote(), d.votingOpen(), issued, d.reasons());
    }
}
