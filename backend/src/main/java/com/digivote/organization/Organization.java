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
@Table(name = "organizations")
public class Organization {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String slug;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "org_type")
    private OrganizationType orgType;

    @Column(name = "contact_email")
    private String contactEmail;

    private String phone;

    private String tagline;

    @Column(name = "lockout_minutes", nullable = false)
    private int lockoutMinutes = 15;

    @Column(name = "session_minutes", nullable = false)
    private int sessionMinutes = 120;

    @Column(name = "require_mixed_case", nullable = false)
    private boolean requireMixedCase;

    @Column(name = "logo_url")
    private String logoUrl;

    @Column(name = "primary_color", nullable = false)
    private String primaryColor;

    @Column(nullable = false)
    private String status;

    @Column(name = "password_min_length", nullable = false)
    private int passwordMinLength;

    @Column(name = "max_failed_logins", nullable = false)
    private int maxFailedLogins;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Organization() {
    }

    public Organization(String name, String slug, String description, Instant now) {
        this.name = name;
        this.slug = slug;
        this.description = description;
        this.primaryColor = "#1e3a8a";
        this.status = "ACTIVE";
        this.passwordMinLength = 10;
        this.maxFailedLogins = 5;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void setOrgType(OrganizationType orgType) {
        this.orgType = orgType;
    }

    public OrganizationType getOrgType() {
        return orgType;
    }

    public void updateProfile(String name, String description, String logoUrl, String primaryColor, Instant now) {
        this.name = name;
        this.description = description;
        this.logoUrl = logoUrl;
        this.primaryColor = primaryColor;
        this.updatedAt = now;
    }

    public void updateSecurityPolicy(int passwordMinLength, int maxFailedLogins, int lockoutMinutes, int sessionMinutes,
                                     boolean requireMixedCase, Instant now) {
        this.passwordMinLength = passwordMinLength;
        this.maxFailedLogins = maxFailedLogins;
        this.lockoutMinutes = lockoutMinutes;
        this.sessionMinutes = sessionMinutes;
        this.requireMixedCase = requireMixedCase;
        this.updatedAt = now;
    }

    public void updateContact(String contactEmail, String phone, String tagline) {
        this.contactEmail = contactEmail;
        this.phone = phone;
        this.tagline = tagline;
    }

    public String getContactEmail() {
        return contactEmail;
    }

    public String getPhone() {
        return phone;
    }

    public String getTagline() {
        return tagline;
    }

    public int getLockoutMinutes() {
        return lockoutMinutes;
    }

    public int getSessionMinutes() {
        return sessionMinutes;
    }

    public boolean isRequireMixedCase() {
        return requireMixedCase;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getSlug() {
        return slug;
    }

    public String getDescription() {
        return description;
    }

    public String getLogoUrl() {
        return logoUrl;
    }

    public String getPrimaryColor() {
        return primaryColor;
    }

    public String getStatus() {
        return status;
    }

    public int getPasswordMinLength() {
        return passwordMinLength;
    }

    public int getMaxFailedLogins() {
        return maxFailedLogins;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
