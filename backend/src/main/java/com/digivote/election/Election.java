package com.digivote.election;

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
 * Election aggregate root. Its status is private state: the only way to change it is
 * {@link #applyTransition}, which is called exclusively by the state-transition service after the
 * state machine has validated the move. There is deliberately no public status setter.
 */
@Entity
@Table(name = "elections")
public class Election {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "organization_id", nullable = false)
    private Long organizationId;

    @Column(nullable = false)
    private String title;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ElectionStatus status;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "banner_key")
    private String bannerKey;

    @Column(name = "banner_content_type")
    private String bannerContentType;

    @Column(name = "banner_size")
    private Integer bannerSize;

    @Version
    private long version;

    protected Election() {
    }

    public Election(Long organizationId, String title, String description, Long createdBy, Instant now) {
        this.organizationId = organizationId;
        this.title = title;
        this.description = description;
        this.createdBy = createdBy;
        this.status = ElectionStatus.DRAFT;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void updateDetails(String title, String description, Instant now) {
        this.title = title;
        this.description = description;
        this.updatedAt = now;
    }

    public void setBanner(String key, String contentType, int size, Instant now) {
        this.bannerKey = key;
        this.bannerContentType = contentType;
        this.bannerSize = size;
        this.updatedAt = now;
    }

    public void clearBanner(Instant now) {
        this.bannerKey = null;
        this.bannerContentType = null;
        this.bannerSize = null;
        this.updatedAt = now;
    }

    public boolean hasBanner() {
        return bannerKey != null;
    }

    public String getBannerKey() {
        return bannerKey;
    }

    public String getBannerContentType() {
        return bannerContentType;
    }

    /** Package-private: only the state package (via ElectionTransitions) may move an election. */
    void applyTransition(ElectionStatus target, Instant now) {
        this.status = target;
        this.updatedAt = now;
        if (target == ElectionStatus.ARCHIVED) {
            this.archivedAt = now;
        }
    }

    public boolean isReadOnly() {
        return status == ElectionStatus.ARCHIVED;
    }

    public Long getId() {
        return id;
    }

    public Long getOrganizationId() {
        return organizationId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public ElectionStatus getStatus() {
        return status;
    }

    public Long getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getArchivedAt() {
        return archivedAt;
    }
}
