package com.digivote.election;

import com.digivote.candidate.storage.ValidatingMediaStorage;
import com.digivote.crypto.SecureTokens;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.access.User;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.candidate.Candidate;
import com.digivote.candidate.CandidateRepository;
import com.digivote.common.ApiException;
import com.digivote.common.PageResponse;
import com.digivote.election.rules.RuleEngine;
import com.digivote.election.state.ElectionStateMachine;
import com.digivote.organization.Membership;
import com.digivote.organization.MembershipRepository;
import com.digivote.organization.Organization;
import com.digivote.organization.OrganizationRepository;
import com.digivote.organization.RoleCode;
import com.digivote.user.UserAccount;
import com.digivote.user.UserRepository;
import com.digivote.voting.EligibleVoter;
import com.digivote.voting.EligibleVoterRepository;
import com.digivote.voting.VotingCredentialRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ElectionService {

    private final ElectionRepository elections;
    private final ElectionRuleRepository rules;
    private final ElectionAdministratorRepository admins;
    private final StateTransitionRepository transitions;
    private final CandidateRepository candidates;
    private final EligibleVoterRepository voters;
    private final VotingCredentialRepository credentials;
    private final OrganizationRepository organizations;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final AccessControlService access;
    private final ElectionStateMachine stateMachine;
    private final RuleEngine ruleEngine;
    private final AuditService audit;
    private final Clock clock;
    private final ValidatingMediaStorage storage;

    /** Banners are decorative; keep them small. */
    static final int MAX_BANNER_BYTES = 2 * 1024 * 1024;

    public ElectionService(ElectionRepository elections, ElectionRuleRepository rules,
                           ElectionAdministratorRepository admins, StateTransitionRepository transitions,
                           CandidateRepository candidates, EligibleVoterRepository voters,
                           VotingCredentialRepository credentials, OrganizationRepository organizations,
                           MembershipRepository memberships, UserRepository users, AccessControlService access,
                           ElectionStateMachine stateMachine, RuleEngine ruleEngine, AuditService audit, Clock clock,
                           ValidatingMediaStorage storage) {
        this.storage = storage;
        this.elections = elections;
        this.rules = rules;
        this.admins = admins;
        this.transitions = transitions;
        this.candidates = candidates;
        this.voters = voters;
        this.credentials = credentials;
        this.organizations = organizations;
        this.memberships = memberships;
        this.users = users;
        this.access = access;
        this.stateMachine = stateMachine;
        this.ruleEngine = ruleEngine;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public ElectionDtos.ElectionView create(Long orgId, ElectionDtos.CreateElectionRequest request) {
        User user = access.require(orgId, Permission.CREATE_ELECTION);
        Instant now = clock.instant();
        Election election = elections.save(new Election(orgId, request.title().trim(), request.description(),
                user.userId(), now));
        rules.save(new ElectionRule(election.getId(), now));
        if (user.role() == RoleCode.ELECTION_ADMIN) {
            admins.save(new ElectionAdministrator(election.getId(), user.userId(), user.userId(), now));
        }
        transitions.save(new StateTransition(election.getId(), null, ElectionStatus.DRAFT, user.userId(),
                "Election created", now));
        audit.record(AuditEventType.ELECTION_CREATED, orgId, election.getId(), user.userId(),
                Map.of("title", election.getTitle()));
        return view(election, user);
    }

    @Transactional(readOnly = true)
    public PageResponse<ElectionDtos.ElectionView> list(Long orgId, int page, int size) {
        User user = access.userInOrganization(orgId);
        boolean seesDrafts = user.can(Permission.MANAGE_ELECTION) || user.can(Permission.VIEW_ELECTION_INTERNALS);
        var pageable = PageResponse.pageable(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Election> result = seesDrafts
                ? elections.findByOrganizationId(orgId, pageable)
                : elections.findByOrganizationIdAndStatusNot(orgId, ElectionStatus.DRAFT, pageable);
        return PageResponse.of(result, e -> view(e, user));
    }

    /** Elections across all of the caller's organizations in which the caller may vote or is a candidate. */
    @Transactional(readOnly = true)
    public List<ElectionDtos.ElectionView> myElections() {
        UserAccount account = access.currentAccount();
        List<Long> electionIds = new java.util.ArrayList<>(voters.findByUserIdAndStatus(account.getId(),
                EligibleVoter.Status.ELIGIBLE).stream().map(EligibleVoter::getElectionId).toList());
        return electionIds.stream().distinct()
                .map(id -> elections.findById(id).orElseThrow())
                .filter(e -> e.getStatus() != ElectionStatus.DRAFT)
                .filter(e -> memberships.findByOrganizationIdAndUserId(e.getOrganizationId(), account.getId())
                        .filter(Membership::isActive).isPresent())
                .map(e -> view(e, access.userInOrganization(e.getOrganizationId())))
                .sorted(Comparator.comparing(ElectionDtos.ElectionView::createdAt).reversed())
                .toList();
    }

    @Transactional(readOnly = true)
    public ElectionDtos.ElectionView get(Long electionId) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        return view(a.election(), a.user());
    }

    @Transactional
    public ElectionDtos.ElectionView update(Long electionId, ElectionDtos.UpdateElectionRequest request) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.MANAGE_ELECTION);
        stateMachine.require(stateMachine.stateOf(a.election()).allowsDetailEdits(), a.election(), "edit details");
        a.election().updateDetails(request.title().trim(), request.description(), clock.instant());
        audit.record(AuditEventType.ELECTION_UPDATED, a.election().getOrganizationId(), electionId,
                a.user().userId(), Map.of("title", request.title()));
        return view(a.election(), a.user());
    }

    @Transactional
    public ElectionDtos.ElectionView setBanner(Long electionId, MultipartFile file) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.MANAGE_ELECTION);
        stateMachine.require(stateMachine.stateOf(a.election()).allowsDetailEdits(), a.election(), "change the banner");
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("UPLOAD_FAILED", "Could not read the uploaded file");
        }
        if (bytes.length > MAX_BANNER_BYTES) {
            throw ApiException.badRequest("UPLOAD_TOO_LARGE", "The banner must be 2 MB or smaller");
        }
        String contentType = storage.validate(ValidatingMediaStorage.Kind.IMAGE, file.getContentType(), bytes);
        String key = "elections/" + electionId + "/banner/" + SecureTokens.randomBase32(20)
                + ("image/png".equals(contentType) ? ".png" : ".jpg");
        storage.store(key, bytes, contentType);
        a.election().setBanner(key, contentType, bytes.length, clock.instant());
        audit.record(AuditEventType.ELECTION_UPDATED, a.election().getOrganizationId(), electionId, a.user().userId(),
                Map.of("banner", "set"));
        return view(a.election(), a.user());
    }

    @Transactional
    public ElectionDtos.ElectionView clearBanner(Long electionId) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.MANAGE_ELECTION);
        stateMachine.require(stateMachine.stateOf(a.election()).allowsDetailEdits(), a.election(), "change the banner");
        a.election().clearBanner(clock.instant());
        audit.record(AuditEventType.ELECTION_UPDATED, a.election().getOrganizationId(), electionId, a.user().userId(),
                Map.of("banner", "removed"));
        return view(a.election(), a.user());
    }

    public record BannerContent(String contentType, byte[] bytes) {
    }

    @Transactional(readOnly = true)
    public BannerContent banner(Long electionId) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        if (!a.election().hasBanner()) {
            throw ApiException.notFound("Banner");
        }
        return new BannerContent(a.election().getBannerContentType(), storage.load(a.election().getBannerKey()));
    }

    @Transactional
    public ElectionDtos.ElectionView updateRules(Long electionId, ElectionDtos.RulesRequest request) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.MANAGE_ELECTION);
        stateMachine.require(stateMachine.stateOf(a.election()).allowsRuleChanges(), a.election(), "change rules");
        RuleSettings settings = request.toSettings();
        ruleEngine.requireValid(ruleEngine.validateStructure(settings));
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        rule.replaceWith(settings, clock.instant());
        audit.record(AuditEventType.ELECTION_RULES_UPDATED, a.election().getOrganizationId(), electionId,
                a.user().userId(), Map.of("maxSelections", settings.maxSelections(),
                        "countingMethod", settings.countingMethod().name(), "notaEnabled", settings.notaEnabled(),
                        "publicResults", settings.publicResults(),
                        "votingStart", String.valueOf(settings.votingStart()),
                        "votingEnd", String.valueOf(settings.votingEnd())));
        return view(a.election(), a.user());
    }

    @Transactional
    public List<ElectionDtos.AdministratorView> assignAdministrator(Long electionId, Long userId) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.ASSIGN_ELECTION_ADMINS);
        Election election = a.election();
        if (election.isReadOnly()) {
            throw ApiException.conflict("ARCHIVED", "Archived elections are read-only");
        }
        Membership target = memberships.findByOrganizationIdAndUserId(election.getOrganizationId(), userId)
                .filter(Membership::isActive)
                .orElseThrow(() -> ApiException.notFound("Member"));
        if (target.getRole() != RoleCode.ELECTION_ADMIN) {
            throw ApiException.rule("NOT_AN_ADMINISTRATOR", "Only Election Administrators can be assigned");
        }
        if (!admins.existsByElectionIdAndUserId(electionId, userId)) {
            admins.save(new ElectionAdministrator(electionId, userId, a.user().userId(), clock.instant()));
            audit.record(AuditEventType.ELECTION_ADMIN_ASSIGNED, election.getOrganizationId(), electionId,
                    a.user().userId(), Map.of("administratorUserId", userId));
        }
        return administrators(electionId);
    }

    @Transactional(readOnly = true)
    public List<ElectionDtos.AdministratorView> listAdministrators(Long electionId) {
        access.requireElection(electionId, Permission.VIEW_ELECTION_INTERNALS);
        return administrators(electionId);
    }

    private List<ElectionDtos.AdministratorView> administrators(Long electionId) {
        return admins.findByElectionId(electionId).stream().map(ad -> {
            UserAccount u = users.findById(ad.getUserId()).orElseThrow();
            return new ElectionDtos.AdministratorView(u.getId(), u.getFullName(), u.getEmail(), ad.getAssignedAt());
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<ElectionDtos.TimelineEntry> timeline(Long electionId) {
        access.viewElection(electionId);
        return transitions.findByElectionIdOrderByOccurredAtAscIdAsc(electionId).stream()
                .map(t -> new ElectionDtos.TimelineEntry(t.getFromStatus(), t.getToStatus(), t.getOccurredAt(),
                        t.getActorUserId() == null ? null
                                : users.findById(t.getActorUserId()).map(UserAccount::getFullName).orElse(null),
                        t.getNote()))
                .toList();
    }

    ElectionDtos.ElectionView view(Election e, User user) {
        ElectionRule rule = rules.findById(e.getId()).orElseThrow();
        Organization org = organizations.findById(e.getOrganizationId()).orElseThrow();
        boolean operator = access.operates(user, e);
        Optional<EligibleVoter> eligibility = voters.findByElectionIdAndUserId(e.getId(), user.userId())
                .filter(EligibleVoter::isEligible);
        boolean isCandidate = candidates.existsByElectionIdAndUserIdAndStatus(e.getId(), user.userId(),
                Candidate.Status.ACTIVE);
        boolean mayVote = eligibility.isPresent() && user.mayVote(new User.VotingContext(operator, isCandidate,
                rule.isAdministratorsMayVote(), rule.isCandidatesMayVote()));
        boolean issued = eligibility.flatMap(ev -> credentials.findByEligibleVoterIdAndGeneration(ev.getId(), ev.getCredentialGeneration())).isPresent();
        ElectionDtos.MyRelation me = new ElectionDtos.MyRelation(operator, eligibility.isPresent(), mayVote,
                isCandidate, issued, user.role().name());
        return new ElectionDtos.ElectionView(e.getId(), e.getOrganizationId(), org.getName(), e.getTitle(),
                e.getDescription(), e.getStatus(), e.getCreatedAt(), e.getUpdatedAt(), e.getArchivedAt(),
                rule.toSettings(), candidates.countByElectionIdAndStatus(e.getId(), Candidate.Status.ACTIVE),
                voters.countByElectionIdAndStatus(e.getId(), EligibleVoter.Status.ELIGIBLE), me, e.hasBanner());
    }
}
