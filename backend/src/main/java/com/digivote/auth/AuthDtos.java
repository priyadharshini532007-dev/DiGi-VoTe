package com.digivote.auth;

import com.digivote.access.Permission;
import com.digivote.organization.OrganizationType;
import com.digivote.organization.RoleCode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Set;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterOrganizationRequest(
            @NotBlank @Size(max = 120) String organizationName,
            @Size(max = 1000) String organizationDescription,
            OrganizationType organizationType,
            @NotBlank @Size(max = 120) String fullName,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 10, max = 128) String password) {
    }

    /** Sign in with either the DV number (DV-2026-00001) or the email address; one of them is required. */
    public record LoginRequest(@Email String email,
                               @Pattern(regexp = "^\\s*[Dd][Vv]-\\d{4}-\\d{5,}\\s*$", message = "Invalid DV number")
                               String dvNumber,
                               @NotBlank @Size(max = 128) String password) {

        @AssertTrue(message = "Enter your DV number or email")
        public boolean isIdentifierPresent() {
            return (email != null && !email.isBlank()) || (dvNumber != null && !dvNumber.isBlank());
        }
    }

    public record ActivateRequest(
            @NotBlank @Email String email,
            @NotBlank @Pattern(regexp = "^[0-9A-Za-z-]{8,20}$", message = "Invalid activation code format") String activationCode,
            @NotBlank @Size(max = 120) String fullName,
            @NotBlank @Size(min = 8, max = 128) String password) {
    }

    /** Redeem a recovery code: identify the account by DV number or email, then choose a new password. */
    public record RecoverRequest(@Email String email,
                                 @Pattern(regexp = "^\\s*[Dd][Vv]-\\d{4}-\\d{5,}\\s*$", message = "Invalid DV number")
                                 String dvNumber,
                                 @NotBlank @Pattern(regexp = "^[0-9A-Za-z-]{8,20}$", message = "Invalid recovery code format")
                                 String recoveryCode,
                                 @NotBlank @Size(max = 128) String newPassword) {

        @AssertTrue(message = "Enter your DV number or email")
        public boolean isIdentifierPresent() {
            return (email != null && !email.isBlank()) || (dvNumber != null && !dvNumber.isBlank());
        }
    }

    public record FirebaseLoginRequest(@NotBlank @Size(max = 4096) String idToken) {
    }

    public record FirebaseRegisterOrganizationRequest(
            @NotBlank @Size(max = 4096) String idToken,
            @NotBlank @Size(max = 120) String organizationName,
            @Size(max = 1000) String organizationDescription,
            OrganizationType organizationType,
            @NotBlank @Size(max = 120) String fullName) {
    }

    public record FirebaseActivateRequest(
            @NotBlank @Size(max = 4096) String idToken,
            @NotBlank @Pattern(regexp = "^[0-9A-Za-z-]{8,20}$", message = "Invalid activation code format") String activationCode,
            @NotBlank @Size(max = 120) String fullName) {
    }

    public record ChangePasswordRequest(@NotBlank String currentPassword,
                                        @NotBlank @Size(min = 8, max = 128) String newPassword) {
    }

    public record UpdateProfileRequest(@NotBlank @Size(max = 120) String fullName,
                                       @Size(max = 20) @Pattern(regexp = "^[0-9+ -]*$") String mobileNumber) {
    }

    public record MembershipView(Long membershipId, Long organizationId, String organizationName,
                                 String organizationSlug, OrganizationType organizationType, String primaryColor, RoleCode role, String status,
                                 String homePath, Set<Permission> permissions, List<String> dashboardSections) {
    }

    public record MeResponse(Long id, String dvNumber, String email, String fullName, String mobileNumber, Instant lastLoginAt,
                             boolean firebaseLinked, boolean localPassword, List<MembershipView> memberships) {
    }

    public record SessionResponse(String token, Instant expiresAt, MeResponse user) {
    }

    public record AuthConfigResponse(boolean firebaseEnabled, boolean devMode) {
    }
}
