package com.digivote.organization;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.Map;

public final class OrganizationDtos {

    private OrganizationDtos() {
    }

    public record OrganizationView(Long id, String name, String slug, String description, OrganizationType type, String logoUrl,
                                   String primaryColor, String status, int passwordMinLength, int maxFailedLogins,
                                   Instant createdAt, String contactEmail, String phone, String tagline,
                                   int lockoutMinutes, int sessionMinutes, boolean requireMixedCase) {
        static OrganizationView of(Organization o) {
            return new OrganizationView(o.getId(), o.getName(), o.getSlug(), o.getDescription(), o.getOrgType(), o.getLogoUrl(),
                    o.getPrimaryColor(), o.getStatus(), o.getPasswordMinLength(), o.getMaxFailedLogins(),
                    o.getCreatedAt(), o.getContactEmail(), o.getPhone(), o.getTagline(), o.getLockoutMinutes(),
                    o.getSessionMinutes(), o.isRequireMixedCase());
        }
    }

    public record UpdateOrganizationRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 1000) String description,
            OrganizationType type,
            @Size(max = 254) @Email String contactEmail,
            @Size(max = 30) @Pattern(regexp = "^[0-9+ -]*$", message = "Use digits, spaces, + and - only") String phone,
            @Size(max = 160) String tagline,
            @Size(max = 500) @Pattern(regexp = "^(https://.*)?$", message = "Logo URL must use https") String logoUrl,
            @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$") String primaryColor) {
    }

    /** New settings are optional so older clients keep working: a missing value keeps the current one. */
    public record SecurityPolicyRequest(@Min(8) @Max(128) int passwordMinLength,
                                        @Min(3) @Max(20) int maxFailedLogins,
                                        @Min(5) @Max(120) Integer lockoutMinutes,
                                        @Min(15) @Max(480) Integer sessionMinutes,
                                        Boolean requireMixedCase) {
    }

    public record MemberView(Long membershipId, Long userId, String email, String fullName, RoleCode role,
                             String status, Instant joinedAt, Instant lastLoginAt) {
    }

    public record InviteMemberRequest(@NotBlank @Email @Size(max = 254) String email,
                                      @NotBlank @Size(max = 120) String fullName,
                                      @NotNull RoleCode role) {
    }

    /** The activation code is returned exactly once, to the inviter, to pass on to the invitee. */
    public record InvitationView(MemberView member, String activationCode, Instant expiresAt, String activationUrl) {
    }

    /** The recovery code is returned exactly once, to the owner, to pass on to the member. */
    public record RecoveryView(String recoveryCode, Instant expiresAt, String recoveryUrl) {
    }

    public record ChangeRoleRequest(@NotNull RoleCode role) {
    }

    public record ChangeStatusRequest(@NotNull Membership.Status status) {
    }

    public record OverviewView(OrganizationView organization, Map<String, Long> membersByRole,
                               Map<String, Long> electionsByStatus, long securityEventsTotal,
                               long auditRecords, long pendingInvitations) {
    }

    public record RoleView(String code, String name, String description) {
    }
}
