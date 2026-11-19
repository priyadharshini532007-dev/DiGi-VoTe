package com.digivote.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/** Append-only, hash-chained audit record (see {@link AuditHasher} for the canonical form). */
@Entity
@Immutable
@Table(name = "audit_logs")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "chain_key", nullable = false)
    private String chainKey;

    @Column(nullable = false)
    private long seq;

    @Column(name = "event_id", nullable = false)
    private String eventId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "organization_id")
    private Long organizationId;

    @Column(name = "election_id")
    private Long electionId;

    @Column(name = "actor_ref")
    private String actorRef;

    @Column(name = "metadata_json", nullable = false)
    private String metadataJson;

    @Column(name = "prev_hash", nullable = false)
    private String prevHash;

    @Column(name = "record_hash", nullable = false)
    private String recordHash;

    protected AuditLog() {
    }

    public AuditLog(String chainKey, long seq, String eventId, String eventType, Instant occurredAt,
                    Long organizationId, Long electionId, String actorRef, String metadataJson,
                    String prevHash, String recordHash) {
        this.chainKey = chainKey;
        this.seq = seq;
        this.eventId = eventId;
        this.eventType = eventType;
        this.occurredAt = occurredAt;
        this.organizationId = organizationId;
        this.electionId = electionId;
        this.actorRef = actorRef;
        this.metadataJson = metadataJson;
        this.prevHash = prevHash;
        this.recordHash = recordHash;
    }

    public Long getId() {
        return id;
    }

    public String getChainKey() {
        return chainKey;
    }

    public long getSeq() {
        return seq;
    }

    public String getEventId() {
        return eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public Long getOrganizationId() {
        return organizationId;
    }

    public Long getElectionId() {
        return electionId;
    }

    public String getActorRef() {
        return actorRef;
    }

    public String getMetadataJson() {
        return metadataJson;
    }

    public String getPrevHash() {
        return prevHash;
    }

    public String getRecordHash() {
        return recordHash;
    }
}
