package com.digivote.election;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/** Election timeline entry (one per accepted state transition). */
@Entity
@Immutable
@Table(name = "election_state_transitions")
public class StateTransition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status")
    private ElectionStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false)
    private ElectionStatus toStatus;

    @Column(name = "actor_user_id")
    private Long actorUserId;

    private String note;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected StateTransition() {
    }

    public StateTransition(Long electionId, ElectionStatus from, ElectionStatus to, Long actorUserId, String note,
                           Instant occurredAt) {
        this.electionId = electionId;
        this.fromStatus = from;
        this.toStatus = to;
        this.actorUserId = actorUserId;
        this.note = note;
        this.occurredAt = occurredAt;
    }

    public Long getId() {
        return id;
    }

    public Long getElectionId() {
        return electionId;
    }

    public ElectionStatus getFromStatus() {
        return fromStatus;
    }

    public ElectionStatus getToStatus() {
        return toStatus;
    }

    public Long getActorUserId() {
        return actorUserId;
    }

    public String getNote() {
        return note;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
