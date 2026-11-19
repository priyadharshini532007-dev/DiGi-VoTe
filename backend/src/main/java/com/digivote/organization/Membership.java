package com.digivote.organization;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "organization_memberships")
public class Membership {

    public enum Status { INVITED, ACTIVE, SUSPENDED, REMOVED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "organization_id", nullable = false)
    private Long organizationId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role_code", nullable = false)
    private RoleCode role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "activation_code_hash")
    private String activationCodeHash;

    @Column(name = "activation_expires_at")
    private Instant activationExpiresAt;

    @Column(name = "invited_by")
    private Long invitedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Membership() {
    }

    public Membership(Long organizationId, Long userId, RoleCode role, Status status, Long invitedBy, Instant now) {
        this.organizationId = organizationId;
        this.userId = userId;
        this.role = role;
        this.status = status;
        this.invitedBy = invitedBy;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void setPendingActivation(String codeHash, Instant expiresAt) {
        this.activationCodeHash = codeHash;
        this.activationExpiresAt = expiresAt;
    }

    public void activate(Instant now) {
        this.status = Status.ACTIVE;
        this.activationCodeHash = null;
        this.activationExpiresAt = null;
        this.updatedAt = now;
    }

    public void changeRole(RoleCode role, Instant now) {
        this.role = role;
        this.updatedAt = now;
    }

    public void changeStatus(Status status, Instant now) {
        this.status = status;
        this.updatedAt = now;
    }

    public boolean isActive() {
        return status == Status.ACTIVE;
    }

    public Long getId() {
        return id;
    }

    public Long getOrganizationId() {
        return organizationId;
    }

    public Long getUserId() {
        return userId;
    }

    public RoleCode getRole() {
        return role;
    }

    public Status getStatus() {
        return status;
    }

    public String getActivationCodeHash() {
        return activationCodeHash;
    }

    public Instant getActivationExpiresAt() {
        return activationExpiresAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
