package com.digivote.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Appends hash-chained audit records. Chains are per organization ("ORG-{id}") plus "SYSTEM" for
 * events without an organization. The chain head row is locked for the append, so concurrent writers
 * are serialized and sequence numbers stay gap-free.
 */
@Service
public class AuditService {

    /** Keys that must never reach audit metadata. */
    private static final Pattern FORBIDDEN_KEYS =
            Pattern.compile("(?i).*(password|secret|token|signature|selection|choice|credential|code|ballotContent).*");
    private static final int MAX_VALUE_LENGTH = 200;

    private final AuditLogRepository logs;
    private final AuditChainHeadRepository heads;
    private final Clock clock;
    private final ObjectMapper canonicalMapper;

    public AuditService(AuditLogRepository logs, AuditChainHeadRepository heads, Clock clock) {
        this.logs = logs;
        this.heads = heads;
        this.clock = clock;
        this.canonicalMapper = new ObjectMapper().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    }

    public static String chainKey(Long organizationId) {
        return organizationId == null ? "SYSTEM" : "ORG-" + organizationId;
    }

    /** Appends within the caller's transaction: the record commits or rolls back with the business change. */
    @Transactional(propagation = Propagation.REQUIRED)
    public AuditLog record(AuditEventType type, Long organizationId, Long electionId, Long actorUserId,
                           Map<String, ?> metadata) {
        return append(type, organizationId, electionId, actorUserId == null ? null : "user:" + actorUserId, metadata);
    }

    /** Appends in its own transaction, for events that must survive a rolled-back business operation. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public AuditLog recordIndependently(AuditEventType type, Long organizationId, Long electionId, String actorRef,
                                        Map<String, ?> metadata) {
        return append(type, organizationId, electionId, actorRef, metadata);
    }

    /**
     * Appends an event about the anonymous side (e.g. ballot accepted) with no actor and a timestamp
     * coarsened to the minute, so the audit trail does not add a precise timing signal.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public AuditLog recordAnonymous(AuditEventType type, Long organizationId, Long electionId, Map<String, ?> metadata) {
        return append(type, organizationId, electionId, null, metadata, ChronoUnit.MINUTES);
    }

    private AuditLog append(AuditEventType type, Long organizationId, Long electionId, String actorRef,
                            Map<String, ?> metadata) {
        return append(type, organizationId, electionId, actorRef, metadata, ChronoUnit.MILLIS);
    }

    private AuditLog append(AuditEventType type, Long organizationId, Long electionId, String actorRef,
                            Map<String, ?> metadata, ChronoUnit precision) {
        String chainKey = chainKey(organizationId);
        // Lock first: INSERT IGNORE on an existing key takes a shared lock, and two shared holders upgrading
        // to exclusive would deadlock. Only a brand-new chain needs the insert.
        AuditChainHead head = heads.lock(chainKey).orElseGet(() -> {
            heads.ensureExists(chainKey, AuditHasher.GENESIS);
            return heads.lock(chainKey).orElseThrow();
        });
        long seq = head.getLastSeq() + 1;
        Instant occurredAt = clock.instant().truncatedTo(precision);
        String eventId = UUID.randomUUID().toString();
        String json = sanitize(metadata);
        String hash = AuditHasher.hash(chainKey, seq, eventId, type.name(), occurredAt, organizationId, electionId,
                actorRef, json, head.getLastHash());
        AuditLog log = logs.save(new AuditLog(chainKey, seq, eventId, type.name(), occurredAt, organizationId,
                electionId, actorRef, json, head.getLastHash(), hash));
        head.advance(seq, hash);
        return log;
    }

    String sanitize(Map<String, ?> metadata) {
        Map<String, Object> clean = new TreeMap<>();
        if (metadata != null) {
            metadata.forEach((key, value) -> {
                if (key == null || FORBIDDEN_KEYS.matcher(key).matches() || value == null) {
                    return;
                }
                Object v = value instanceof Number || value instanceof Boolean ? value : truncate(value.toString());
                clean.put(key, v);
            });
        }
        try {
            return canonicalMapper.writeValueAsString(clean);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Audit metadata serialization failed", e);
        }
    }

    private static String truncate(String s) {
        return s.length() <= MAX_VALUE_LENGTH ? s : s.substring(0, MAX_VALUE_LENGTH);
    }
}
