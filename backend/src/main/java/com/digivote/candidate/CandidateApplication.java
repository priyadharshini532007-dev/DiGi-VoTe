package com.digivote.candidate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Candidate application workflow: SUBMITTED -> (CORRECTION_REQUESTED -> SUBMITTED)* -> APPROVED | REJECTED | WITHDRAWN. */
@Entity
@Table(name = "candidate_applications")
public class CandidateApplication {

    public enum Status { SUBMITTED, CORRECTION_REQUESTED, APPROVED, REJECTED, WITHDRAWN }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(nullable = false)
    private String statement;

    private String qualifications;

    private String achievements;

    private String education;

    private String experience;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "reviewer_note")
    private String reviewerNote;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CandidateApplication() {
    }

    public CandidateApplication(Long electionId, Long userId, String displayName, String statement,
                                String qualifications, String achievements, Instant now) {
        this.electionId = electionId;
        this.userId = userId;
        this.displayName = displayName;
        this.statement = statement;
        this.qualifications = qualifications;
        this.achievements = achievements;
        this.status = Status.SUBMITTED;
        this.submittedAt = now;
        this.updatedAt = now;
    }

    public void setBackground(String education, String experience) {
        this.education = education;
        this.experience = experience;
    }

    public String getEducation() {
        return education;
    }

    public String getExperience() {
        return experience;
    }

    public void revise(String displayName, String statement, String qualifications, String achievements, Instant now) {
        if (status != Status.SUBMITTED && status != Status.CORRECTION_REQUESTED) {
            throw new IllegalStateException("Application can no longer be edited");
        }
        this.displayName = displayName;
        this.statement = statement;
        this.qualifications = qualifications;
        this.achievements = achievements;
        this.status = Status.SUBMITTED;
        this.updatedAt = now;
    }

    public void review(Status decision, String note, Long reviewerId, Instant now) {
        if (status != Status.SUBMITTED) {
            throw new IllegalStateException("Only submitted applications can be reviewed");
        }
        if (decision != Status.APPROVED && decision != Status.REJECTED && decision != Status.CORRECTION_REQUESTED) {
            throw new IllegalArgumentException("Invalid review decision");
        }
        this.status = decision;
        this.reviewerNote = note;
        this.reviewedBy = reviewerId;
        this.reviewedAt = now;
        this.updatedAt = now;
    }

    public void withdraw(Instant now) {
        if (status == Status.REJECTED || status == Status.WITHDRAWN) {
            throw new IllegalStateException("Application is already closed");
        }
        this.status = Status.WITHDRAWN;
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public Long getElectionId() {
        return electionId;
    }

    public Long getUserId() {
        return userId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getStatement() {
        return statement;
    }

    public String getQualifications() {
        return qualifications;
    }

    public String getAchievements() {
        return achievements;
    }

    public Status getStatus() {
        return status;
    }

    public String getReviewerNote() {
        return reviewerNote;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }
}
