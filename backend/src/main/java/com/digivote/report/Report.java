package com.digivote.report;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/** A generated report snapshot (content is JSON, hashed for tamper evidence). */
@Entity
@Immutable
@Table(name = "reports")
public class Report {

    public enum Type { ELECTION, AUDIT, SECURITY, PARTICIPATION, HEALTH }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "organization_id", nullable = false)
    private Long organizationId;

    @Column(name = "election_id")
    private Long electionId;

    @Column(name = "report_type", nullable = false)
    private String reportType;

    @Column(name = "generated_by", nullable = false)
    private Long generatedBy;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    @Column(name = "content_json", nullable = false)
    private String contentJson;

    @Column(name = "content_hash", nullable = false)
    private String contentHash;

    protected Report() {
    }

    public Report(Long organizationId, Long electionId, Type type, Long generatedBy, Instant generatedAt,
                  String contentJson, String contentHash) {
        this.organizationId = organizationId;
        this.electionId = electionId;
        this.reportType = type.name();
        this.generatedBy = generatedBy;
        this.generatedAt = generatedAt;
        this.contentJson = contentJson;
        this.contentHash = contentHash;
    }

    public Long getId() {
        return id;
    }

    public Long getOrganizationId() {
        return organizationId;
    }

    public Long getElectionId() {
        return electionId;
    }

    public String getReportType() {
        return reportType;
    }

    public Long getGeneratedBy() {
        return generatedBy;
    }

    public Instant getGeneratedAt() {
        return generatedAt;
    }

    public String getContentJson() {
        return contentJson;
    }

    public String getContentHash() {
        return contentHash;
    }
}
