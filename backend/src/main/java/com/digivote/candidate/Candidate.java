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

/** An approved contestant appearing on the ballot. */
@Entity
@Table(name = "candidates")
public class Candidate {

    public enum Status { ACTIVE, WITHDRAWN }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "election_id", nullable = false)
    private Long electionId;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    private String qualifications;

    private String achievements;

    private String education;

    private String experience;

    @Column(name = "photo_media_id")
    private Long photoMediaId;

    @Column(name = "ballot_position", nullable = false)
    private int ballotPosition;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Candidate() {
    }

    public Candidate(CandidateApplication application, int ballotPosition, Instant now) {
        this.electionId = application.getElectionId();
        this.applicationId = application.getId();
        this.userId = application.getUserId();
        this.displayName = application.getDisplayName();
        this.qualifications = application.getQualifications();
        this.achievements = application.getAchievements();
        this.education = application.getEducation();
        this.experience = application.getExperience();
        this.ballotPosition = ballotPosition;
        this.status = Status.ACTIVE;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void updateBackground(String education, String experience) {
        this.education = education;
        this.experience = experience;
    }

    public String getEducation() {
        return education;
    }

    public String getExperience() {
        return experience;
    }

    public void updateProfile(String displayName, String qualifications, String achievements, Instant now) {
        this.displayName = displayName;
        this.qualifications = qualifications;
        this.achievements = achievements;
        this.updatedAt = now;
    }

    public void setPhoto(Long mediaId, Instant now) {
        this.photoMediaId = mediaId;
        this.updatedAt = now;
    }

    public void withdraw(Instant now) {
        this.status = Status.WITHDRAWN;
        this.updatedAt = now;
    }

    public boolean isActive() {
        return status == Status.ACTIVE;
    }

    public Long getId() {
        return id;
    }

    public Long getElectionId() {
        return electionId;
    }

    public Long getApplicationId() {
        return applicationId;
    }

    public Long getUserId() {
        return userId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getQualifications() {
        return qualifications;
    }

    public String getAchievements() {
        return achievements;
    }

    public Long getPhotoMediaId() {
        return photoMediaId;
    }

    public int getBallotPosition() {
        return ballotPosition;
    }

    public Status getStatus() {
        return status;
    }
}
