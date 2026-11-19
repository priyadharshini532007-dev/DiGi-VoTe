package com.digivote.election.state;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.common.ApiException;
import com.digivote.election.Election;
import com.digivote.election.ElectionRepository;
import com.digivote.election.ElectionStatus;
import com.digivote.election.ElectionTransitions;
import com.digivote.election.ReadinessService;
import com.digivote.election.StateTransition;
import com.digivote.election.StateTransitionRepository;
import com.digivote.result.ResultService;
import com.digivote.verification.BulletinBoardService;
import com.digivote.voting.BulletinBoardRepository;
import com.digivote.voting.ElectionKeyService;
import com.digivote.voting.ElectionKeysRepository;
import org.springframework.context.ApplicationEventPublisher;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;

/**
 * The only way to change an election's status. Validates the move with the state machine, applies the
 * readiness guards, performs the transition's side effects atomically (key generation when voting
 * opens, result publication), records the timeline and audit trail, and notifies observers.
 */
@Service
public class ElectionLifecycleService {

    private final ElectionRepository elections;
    private final StateTransitionRepository transitions;
    private final ElectionStateMachine stateMachine;
    private final ReadinessService readiness;
    private final ElectionKeyService keys;
    private final ResultService results;
    private final AccessControlService access;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final ElectionKeysRepository keysRepository;
    private final BulletinBoardService bulletin;
    private final BulletinBoardRepository bulletinEntries;
    private final Clock clock;
    @PersistenceContext
    private EntityManager entityManager;

    public ElectionLifecycleService(ElectionRepository elections, StateTransitionRepository transitions,
                                    ElectionStateMachine stateMachine, ReadinessService readiness,
                                    ElectionKeyService keys, ResultService results, AccessControlService access,
                                    AuditService audit, ApplicationEventPublisher events,
                                    ElectionKeysRepository keysRepository, BulletinBoardService bulletin,
                                    BulletinBoardRepository bulletinEntries, Clock clock) {
        this.elections = elections;
        this.transitions = transitions;
        this.stateMachine = stateMachine;
        this.readiness = readiness;
        this.keys = keys;
        this.results = results;
        this.access = access;
        this.audit = audit;
        this.events = events;
        this.keysRepository = keysRepository;
        this.bulletin = bulletin;
        this.bulletinEntries = bulletinEntries;
        this.clock = clock;
    }

    /**
     * Lock order, shared with {@code BallotTransaction.cast}: the election_keys row (per-election ballot lock) first,
     * then the election row. Ballots hold the keys lock while their inserts take a shared lock on the election row
     * through the foreign keys, so closing voting with the election row locked first deadlocked with them.
     * READ COMMITTED: once the locks are held, every read (pending ballots, bulletin head) must see ballots that
     * committed while this transaction waited; a repeatable-read snapshot taken by the access check would not.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Election transition(Long electionId, ElectionStatus target, String note) {
        Permission permission = switch (target) {
            case PUBLISHED -> Permission.PUBLISH_RESULTS;
            case ARCHIVED -> Permission.ARCHIVE_ELECTION;
            default -> Permission.MANAGE_ELECTION;
        };
        AccessControlService.ElectionAccess a = access.requireElection(electionId, permission);
        if (target == ElectionStatus.VERIFICATION) {
            keysRepository.lockForBallot(electionId); // absent only if voting never opened; the state machine refuses that
        }
        Election election = elections.findByIdForUpdate(electionId).orElseThrow();
        entityManager.refresh(election); // the access check may have loaded it before the locks were held
        ElectionStatus from = election.getStatus();
        stateMachine.requireTransition(from, target);
        Instant now = clock.instant();
        Long actor = a.user().userId();

        if (from == ElectionStatus.DRAFT || from == ElectionStatus.REGISTRATION || from == ElectionStatus.CAMPAIGN) {
            ReadinessService.Readiness r = readiness.evaluate(election);
            if (!r.ready()) {
                String failed = r.checks().stream().filter(c -> !c.passed()).map(ReadinessService.Check::label)
                        .findFirst().orElse("readiness requirements");
                throw ApiException.rule("NOT_READY", "Election is not ready: " + failed);
            }
        }
        if (target == ElectionStatus.VOTING) {
            keys.generate(electionId);
            audit.record(AuditEventType.ELECTION_KEYS_GENERATED, election.getOrganizationId(), electionId, actor,
                    Map.of("keyFingerprint", keys.require(electionId).getRsaFingerprint(),
                            "publicKeyFingerprintV1", com.digivote.crypto.CredentialKeyFingerprint.of(electionId,
                                    keys.require(electionId).getRsaModulus(), keys.require(electionId).getRsaPublicExponent())));
        }
        if (target == ElectionStatus.VERIFICATION) {
            // Voting closes under the per-election ballot lock taken above: publish every ballot still waiting as one
            // final shuffled batch. Ballot requests that were waiting for the lock re-check the status afterwards
            // and are refused.
            int published = bulletin.publishPending(electionId, 1,
                    LocalDateTime.ofInstant(now, ZoneOffset.UTC).truncatedTo(ChronoUnit.MINUTES));
            audit.record(AuditEventType.BALLOTS_PUBLISHED, election.getOrganizationId(), electionId, null,
                    Map.of("published", published, "trigger", "voting-closed",
                            "totalOnBoard", bulletinEntries.countByElectionId(electionId)));
        }
        if (target == ElectionStatus.PUBLISHED) {
            results.publish(electionId, actor);
        }

        ElectionTransitions.apply(election, target, now);
        transitions.save(new StateTransition(electionId, from, target, actor, note, now));

        Map<String, Object> meta = new HashMap<>();
        meta.put("from", from.name());
        meta.put("to", target.name());
        if (note != null && !note.isBlank()) {
            meta.put("note", note);
        }
        audit.record(AuditEventType.ELECTION_STATE_CHANGED, election.getOrganizationId(), electionId, actor, meta);
        AuditEventType specific = switch (target) {
            case VOTING -> AuditEventType.ELECTION_VOTING_OPENED;
            case VERIFICATION -> AuditEventType.ELECTION_VOTING_CLOSED;
            case PUBLISHED -> AuditEventType.RESULTS_PUBLISHED;
            case ARCHIVED -> AuditEventType.ELECTION_ARCHIVED;
            default -> null;
        };
        if (specific != null) {
            audit.record(specific, election.getOrganizationId(), electionId, actor, Map.of());
        }
        events.publishEvent(new ElectionLifecycleEvent(electionId, election.getOrganizationId(), election.getTitle(),
                from, target, actor));
        return election;
    }
}
