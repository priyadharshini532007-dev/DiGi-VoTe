package com.digivote.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Duration;
import java.time.Instant;

/**
 * Persistent account (identity). The password hash is private state reachable only through
 * {@link #passwordHash()} for the authentication service and is never serialized to the API.
 * Role-specific behaviour lives in {@link com.digivote.access.User} and its subclasses.
 */
@Entity
@Table(name = "users")
public class UserAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "dv_number", nullable = false, unique = true, updatable = false)
    private String dvNumber;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "mobile_number")
    private String mobileNumber;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "firebase_uid")
    private String firebaseUid;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status;

    @Column(name = "failed_login_count", nullable = false)
    private int failedLoginCount;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserAccount() {
    }

    public UserAccount(String dvNumber, String email, String fullName, UserStatus status, Instant now) {
        this.dvNumber = dvNumber;
        this.email = normalizeEmail(email);
        this.fullName = fullName;
        this.status = status;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase();
    }

    public void setPasswordHash(String passwordHash, Instant now) {
        this.passwordHash = passwordHash;
        this.updatedAt = now;
    }

    public String passwordHash() {
        return passwordHash;
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    /** @return true when this failure caused a lockout */
    public boolean recordFailedLogin(int maxFailures, Duration lockout, Instant now) {
        failedLoginCount++;
        updatedAt = now;
        if (failedLoginCount >= maxFailures) {
            lockedUntil = now.plus(lockout);
            failedLoginCount = 0;
            return true;
        }
        return false;
    }

    /** Clears the failed-attempt counter and any lockout (after a verified password recovery). */
    public void resetFailedLogins(Instant now) {
        failedLoginCount = 0;
        lockedUntil = null;
        updatedAt = now;
    }

    public void recordSuccessfulLogin(Instant now) {
        failedLoginCount = 0;
        lockedUntil = null;
        lastLoginAt = now;
        updatedAt = now;
    }

    public void activate(String fullName, Instant now) {
        if (fullName != null && !fullName.isBlank()) {
            this.fullName = fullName.trim();
        }
        this.status = UserStatus.ACTIVE;
        this.updatedAt = now;
    }

    public void linkFirebase(String uid, Instant now) {
        this.firebaseUid = uid;
        this.updatedAt = now;
    }

    public void updateProfile(String fullName, String mobileNumber, Instant now) {
        this.fullName = fullName;
        this.mobileNumber = mobileNumber;
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public String getDvNumber() {
        return dvNumber;
    }

    public String getEmail() {
        return email;
    }

    public String getFullName() {
        return fullName;
    }

    public String getMobileNumber() {
        return mobileNumber;
    }

    public String getFirebaseUid() {
        return firebaseUid;
    }

    public UserStatus getStatus() {
        return status;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
