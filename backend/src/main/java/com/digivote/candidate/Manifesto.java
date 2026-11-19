package com.digivote.candidate;

import com.digivote.common.ApiException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

/**
 * Candidate manifesto. Once {@link #freeze} is called (when voting opens) every mutator refuses;
 * the database trigger trg_manifesto_frozen enforces the same rule underneath.
 */
@Entity
@Table(name = "manifestos")
public class Manifesto {

    public enum Status { DRAFT, PUBLISHED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "candidate_id", nullable = false)
    private Long candidateId;

    private String vision;
    private String mission;
    private String goals;
    private String schemes;

    private String initiatives;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(nullable = false)
    private boolean frozen;

    @Column(name = "frozen_at")
    private Instant frozenAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    protected Manifesto() {
    }

    public Manifesto(Long candidateId, Instant now) {
        this.candidateId = candidateId;
        this.status = Status.DRAFT;
        this.updatedAt = now;
    }

    public void edit(String vision, String mission, String goals, String schemes, Instant now) {
        edit(vision, mission, goals, schemes, this.initiatives, now);
    }

    public void edit(String vision, String mission, String goals, String schemes, String initiatives, Instant now) {
        requireEditable();
        this.vision = vision;
        this.mission = mission;
        this.goals = goals;
        this.schemes = schemes;
        this.initiatives = initiatives;
        this.updatedAt = now;
    }

    public String getInitiatives() {
        return initiatives;
    }

    public void publish(Instant now) {
        requireEditable();
        if (isBlank(vision) && isBlank(mission) && isBlank(goals) && isBlank(schemes) && isBlank(initiatives)) {
            throw ApiException.rule("EMPTY_MANIFESTO", "Write the manifesto before publishing it");
        }
        this.status = Status.PUBLISHED;
        this.publishedAt = now;
        this.updatedAt = now;
    }

    public void freeze(Instant now) {
        if (!frozen) {
            this.frozen = true;
            this.frozenAt = now;
            this.updatedAt = now;
        }
    }

    private void requireEditable() {
        if (frozen) {
            throw ApiException.rule("MANIFESTO_FROZEN", "The manifesto is frozen because voting has opened");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    public Long getId() {
        return id;
    }

    public Long getCandidateId() {
        return candidateId;
    }

    public String getVision() {
        return vision;
    }

    public String getMission() {
        return mission;
    }

    public String getGoals() {
        return goals;
    }

    public String getSchemes() {
        return schemes;
    }

    public Status getStatus() {
        return status;
    }

    public boolean isFrozen() {
        return frozen;
    }

    public Instant getFrozenAt() {
        return frozenAt;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
