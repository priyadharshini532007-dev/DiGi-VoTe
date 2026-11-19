package com.digivote.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A one-time password recovery code issued by an organization owner (only its hash is stored). */
@Entity
@Table(name = "password_recovery_codes")
public class PasswordRecovery {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "organization_id", nullable = false)
    private Long organizationId;

    @Column(name = "code_hash", nullable = false)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PasswordRecovery() {
    }

    public PasswordRecovery(Long userId, Long organizationId, String codeHash, Instant expiresAt, Long createdBy,
                            Instant now) {
        this.userId = userId;
        this.organizationId = organizationId;
        this.codeHash = codeHash;
        this.expiresAt = expiresAt;
        this.createdBy = createdBy;
        this.createdAt = now;
    }

    public boolean isUsable(Instant now) {
        return usedAt == null && expiresAt.isAfter(now);
    }

    public void markUsed(Instant now) {
        this.usedAt = now;
    }

    public Long getOrganizationId() {
        return organizationId;
    }
}
