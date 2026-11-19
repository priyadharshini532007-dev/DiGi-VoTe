package com.digivote.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

@Entity
@Immutable
@Table(name = "security_events")
public class SecurityEvent {

    public enum Type {
        AUTH_FAILURE, ACCOUNT_LOCKED, INVALID_TOKEN, AUTHORIZATION_DENIED, CROSS_ORG_ACCESS,
        DUPLICATE_BALLOT, INVALID_CREDENTIAL, BALLOT_OUTSIDE_WINDOW, UPLOAD_REJECTED, APP_CHECK_FAILED,
        DUPLICATE_QR, INVALID_QR
    }

    public enum Severity { LOW, MEDIUM, HIGH }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "organization_id")
    private Long organizationId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(nullable = false)
    private String severity;

    @Column(name = "principal_ref")
    private String principalRef;

    @Column(nullable = false)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected SecurityEvent() {
    }

    public SecurityEvent(Long organizationId, Type type, Severity severity, String principalRef, String detail,
                         Instant occurredAt) {
        this.organizationId = organizationId;
        this.eventType = type.name();
        this.severity = severity.name();
        this.principalRef = principalRef;
        this.detail = detail.length() > 500 ? detail.substring(0, 500) : detail;
        this.occurredAt = occurredAt;
    }

    public Long getId() {
        return id;
    }

    public Long getOrganizationId() {
        return organizationId;
    }

    public String getEventType() {
        return eventType;
    }

    public String getSeverity() {
        return severity;
    }

    public String getPrincipalRef() {
        return principalRef;
    }

    public String getDetail() {
        return detail;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
