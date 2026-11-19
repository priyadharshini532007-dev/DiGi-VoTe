package com.digivote.audit;

import com.digivote.common.Hashing;

import java.time.Instant;
import java.time.format.DateTimeFormatter;

/**
 * Canonical representation for audit hashing (version 1). Fields are joined with '\n' in this order:
 * <pre>
 * DIGI-VOTE-AUDIT-v1
 * chainKey
 * seq
 * eventId
 * eventType
 * occurredAt   (ISO-8601 UTC instant, millisecond precision)
 * organizationId | "-"
 * electionId     | "-"
 * actorRef       | "-"
 * metadataJson   (keys sorted, no whitespace)
 * prevHash       (64 hex chars; genesis = 64 zeros)
 * </pre>
 * recordHash = lowercase hex SHA-256 of the UTF-8 bytes of that string.
 */
public final class AuditHasher {

    public static final String GENESIS = "0".repeat(64);

    private AuditHasher() {
    }

    public static String hash(String chainKey, long seq, String eventId, String eventType, Instant occurredAt,
                              Long organizationId, Long electionId, String actorRef, String metadataJson,
                              String prevHash) {
        String canonical = String.join("\n",
                "DIGI-VOTE-AUDIT-v1",
                chainKey,
                Long.toString(seq),
                eventId,
                eventType,
                DateTimeFormatter.ISO_INSTANT.format(occurredAt),
                organizationId == null ? "-" : organizationId.toString(),
                electionId == null ? "-" : electionId.toString(),
                actorRef == null ? "-" : actorRef,
                metadataJson,
                prevHash);
        return Hashing.sha256Hex(canonical);
    }

    public static String hash(AuditLog log) {
        return hash(log.getChainKey(), log.getSeq(), log.getEventId(), log.getEventType(), log.getOccurredAt(),
                log.getOrganizationId(), log.getElectionId(), log.getActorRef(), log.getMetadataJson(),
                log.getPrevHash());
    }
}
