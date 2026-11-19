package com.digivote.election;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "election_administrators")
@IdClass(ElectionAdministrator.Key.class)
public class ElectionAdministrator {

    @Id
    @Column(name = "election_id")
    private Long electionId;

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "assigned_by", nullable = false)
    private Long assignedBy;

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt;

    protected ElectionAdministrator() {
    }

    public ElectionAdministrator(Long electionId, Long userId, Long assignedBy, Instant now) {
        this.electionId = electionId;
        this.userId = userId;
        this.assignedBy = assignedBy;
        this.assignedAt = now;
    }

    public Long getElectionId() {
        return electionId;
    }

    public Long getUserId() {
        return userId;
    }

    public Instant getAssignedAt() {
        return assignedAt;
    }

    public static class Key implements Serializable {
        private Long electionId;
        private Long userId;

        public Key() {
        }

        public Key(Long electionId, Long userId) {
            this.electionId = electionId;
            this.userId = userId;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(electionId, k.electionId) && Objects.equals(userId, k.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(electionId, userId);
        }
    }
}
