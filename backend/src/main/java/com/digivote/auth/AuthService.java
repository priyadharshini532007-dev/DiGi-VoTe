package com.digivote.auth;

import com.digivote.access.User;
import com.digivote.access.UserFactory;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.audit.SecurityEvent;
import com.digivote.audit.SecurityEventService;
import com.digivote.common.ApiException;
import com.digivote.common.Hashing;
import com.digivote.firebase.FirebaseAuthGateway;
import com.digivote.firebase.FirebaseIdentity;
import com.digivote.organization.Membership;
import com.digivote.organization.MembershipRepository;
import com.digivote.organization.Organization;
import com.digivote.organization.OrganizationRepository;
import com.digivote.organization.OrganizationType;
import com.digivote.organization.RoleCode;
import com.digivote.user.DvNumberService;
import com.digivote.user.UserAccount;
import com.digivote.user.UserRepository;
import com.digivote.user.UserStatus;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Authentication: organization onboarding, password login with lockout, invitation activation,
 * Firebase ID-token login with verified-email account linking, and profile/password changes.
 *
 * <p>Security events for failures are recorded by {@link SecurityEventService} in separate
 * transactions so they persist although the login request itself fails.
 */
@Service
public class AuthService {


    private final UserRepository users;
    private final OrganizationRepository organizations;
    private final MembershipRepository memberships;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditService audit;
    private final SecurityEventService securityEvents;
    private final FirebaseAuthGateway firebase;
    private final UserFactory userFactory;
    private final Clock clock;
    private final DvNumberService dvNumbers;
    private final PasswordRecoveryRepository recoveries;
    /** BCrypt hash of a random value, checked when the email is unknown so response timing does not reveal it. */
    private final String dummyHash;

    public AuthService(UserRepository users, OrganizationRepository organizations, MembershipRepository memberships,
                       PasswordEncoder passwordEncoder, JwtService jwtService, AuditService audit,
                       SecurityEventService securityEvents, FirebaseAuthGateway firebase, UserFactory userFactory,
                       Clock clock, DvNumberService dvNumbers, PasswordRecoveryRepository recoveries) {
        this.recoveries = recoveries;
        this.dvNumbers = dvNumbers;
        this.users = users;
        this.organizations = organizations;
        this.memberships = memberships;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.audit = audit;
        this.securityEvents = securityEvents;
        this.firebase = firebase;
        this.userFactory = userFactory;
        this.clock = clock;
        this.dummyHash = passwordEncoder.encode(java.util.UUID.randomUUID().toString());
    }

    @Transactional
    public AuthDtos.SessionResponse registerOrganization(AuthDtos.RegisterOrganizationRequest request) {
        Instant now = clock.instant();
        String email = UserAccount.normalizeEmail(request.email());
        if (users.findByEmail(email).isPresent()) {
            throw ApiException.conflict("EMAIL_IN_USE", "An account with this email already exists; sign in instead");
        }
        validatePassword(request.password(), 10);
        UserAccount owner = new UserAccount(dvNumbers.next(), email, request.fullName().trim(), UserStatus.ACTIVE, now);
        owner.setPasswordHash(passwordEncoder.encode(request.password()), now);
        owner.recordSuccessfulLogin(now);
        owner = users.save(owner);
        createOrganizationWithOwner(request.organizationName(), request.organizationDescription(), request.organizationType(), owner, now);
        return session(owner);
    }

    /** Failed attempts still commit (failure counter, lockout); security events persist in their own transaction. */
    @Transactional(noRollbackFor = ApiException.class)
    public AuthDtos.SessionResponse login(AuthDtos.LoginRequest request) {
        String dv = DvNumberService.normalize(request.dvNumber());
        // A DV number wins when both are sent; the identifier is only used for lookup and security-event hashing.
        String email = dv != null ? dv : UserAccount.normalizeEmail(request.email());
        String password = request.password();
        Instant now = clock.instant();
        Optional<UserAccount> found = dv != null ? users.findByDvNumber(dv)
                : email == null ? Optional.empty() : users.findByEmail(email);
        if (found.isEmpty() || found.get().passwordHash() == null) {
            passwordEncoder.matches(password, dummyHash);
            securityEvents.record(null, SecurityEvent.Type.AUTH_FAILURE, SecurityEvent.Severity.LOW,
                    SecurityEventService.principalRef(email), "Login failed: unknown account or no password set");
            throw ApiException.unauthorized("Invalid credentials");
        }
        UserAccount user = found.get();
        Long orgId = primaryOrganization(user.getId());
        if (user.isLocked(now)) {
            securityEvents.record(orgId, SecurityEvent.Type.AUTH_FAILURE, SecurityEvent.Severity.MEDIUM,
                    SecurityEventService.principalRef(email), "Login attempted while account locked");
            throw new ApiException(HttpStatus.LOCKED, "ACCOUNT_LOCKED",
                    "Too many failed attempts; try again later");
        }
        if (!passwordEncoder.matches(password, user.passwordHash())) {
            boolean locked = user.recordFailedLogin(maxFailures(user.getId()), lockoutDuration(user.getId()), now);
            securityEvents.record(orgId, locked ? SecurityEvent.Type.ACCOUNT_LOCKED : SecurityEvent.Type.AUTH_FAILURE,
                    locked ? SecurityEvent.Severity.HIGH : SecurityEvent.Severity.LOW,
                    SecurityEventService.principalRef(email), locked ? "Account locked after repeated failures"
                            : "Login failed: wrong password");
            throw ApiException.unauthorized("Invalid credentials");
        }
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw ApiException.forbidden("Account is not active");
        }
        user.recordSuccessfulLogin(now);
        audit.record(AuditEventType.AUTH_LOGIN_SUCCEEDED, orgId, null, user.getId(), Map.of("method", "password"));
        return session(user);
    }

    /**
     * Redeems a recovery code issued by an organization owner and sets a new password. Wrong codes count as failed
     * sign-ins (lockout), and every failure looks the same so accounts cannot be probed.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public void recover(AuthDtos.RecoverRequest request) {
        String dv = DvNumberService.normalize(request.dvNumber());
        String identifier = dv != null ? dv : UserAccount.normalizeEmail(request.email());
        Instant now = clock.instant();
        Optional<UserAccount> found = dv != null ? users.findByDvNumber(dv)
                : identifier == null ? Optional.empty() : users.findByEmail(identifier);
        if (found.isEmpty()) {
            passwordEncoder.matches(request.newPassword(), dummyHash);
            securityEvents.record(null, SecurityEvent.Type.AUTH_FAILURE, SecurityEvent.Severity.LOW,
                    SecurityEventService.principalRef(identifier), "Recovery failed: unknown account");
            throw ApiException.badRequest("INVALID_RECOVERY", "Invalid or expired recovery code");
        }
        UserAccount user = found.get();
        Long orgId = primaryOrganization(user.getId());
        if (user.isLocked(now)) {
            throw new ApiException(HttpStatus.LOCKED, "ACCOUNT_LOCKED", "Too many failed attempts; try again later");
        }
        PasswordRecovery recovery = recoveries
                .findByUserIdAndCodeHash(user.getId(), Hashing.sha256Hex(normalizeCode(request.recoveryCode())))
                .filter(r -> r.isUsable(now)).orElse(null);
        if (recovery == null) {
            boolean locked = user.recordFailedLogin(maxFailures(user.getId()), lockoutDuration(user.getId()), now);
            securityEvents.record(orgId, locked ? SecurityEvent.Type.ACCOUNT_LOCKED : SecurityEvent.Type.AUTH_FAILURE,
                    locked ? SecurityEvent.Severity.HIGH : SecurityEvent.Severity.LOW,
                    SecurityEventService.principalRef(identifier), "Recovery failed: wrong or expired code");
            throw ApiException.badRequest("INVALID_RECOVERY", "Invalid or expired recovery code");
        }
        validatePassword(request.newPassword(), strictestMinLength(user.getId()), anyRequiresMixedCase(user.getId()));
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()), now);
        user.resetFailedLogins(now);
        recoveries.findByUserIdAndUsedAtIsNull(user.getId()).forEach(r -> r.markUsed(now));
        audit.record(AuditEventType.AUTH_RECOVERY_COMPLETED, recovery.getOrganizationId(), null, user.getId(), Map.of());
    }

    @Transactional
    public AuthDtos.SessionResponse activate(AuthDtos.ActivateRequest request) {
        Instant now = clock.instant();
        String email = UserAccount.normalizeEmail(request.email());
        UserAccount user = users.findByEmail(email)
                .orElseThrow(() -> ApiException.badRequest("INVALID_ACTIVATION", "Invalid or expired activation code"));
        Membership membership = pendingMembership(user, request.activationCode(), now)
                .orElseThrow(() -> invalidActivation(email));
        Organization org = organizations.findById(membership.getOrganizationId()).orElseThrow();
        if (user.getStatus() == UserStatus.PENDING_ACTIVATION) {
            validatePassword(request.password(), org.getPasswordMinLength(), org.isRequireMixedCase());
            user.setPasswordHash(passwordEncoder.encode(request.password()), now);
            user.activate(request.fullName(), now);
        } else if (user.passwordHash() == null || !passwordEncoder.matches(request.password(), user.passwordHash())) {
            // Existing account joining another organization must prove ownership with its current password.
            throw ApiException.badRequest("INVALID_ACTIVATION", "Use your existing DIGI-VOTE password to accept");
        }
        membership.activate(now);
        user.recordSuccessfulLogin(now);
        audit.record(AuditEventType.AUTH_ACCOUNT_ACTIVATED, org.getId(), null, user.getId(),
                Map.of("role", membership.getRole().name()));
        return session(user);
    }

    /**
     * Firebase sign-in (Google or Email/Password). Linking rules:
     * <ul>
     *   <li>The token must verify and its email must be verified by Firebase; unverified emails are never used.</li>
     *   <li>A Firebase uid already linked to an account signs in to that account.</li>
     *   <li>Otherwise an existing <em>active</em> DIGI-VOTE account with the same verified email is linked once.</li>
     *   <li>An account linked to a different Firebase uid is never relinked; invited (not yet activated) accounts
     *       must use their activation code; no account is created here.</li>
     * </ul>
     * Roles always come from DIGI-VOTE memberships, never from the token or the client.
     */
    @Transactional
    public AuthDtos.SessionResponse firebaseLogin(AuthDtos.FirebaseLoginRequest request) {
        FirebaseIdentity identity = verifiedIdentity(request.idToken());
        Instant now = clock.instant();
        UserAccount user = users.findByFirebaseUid(identity.uid()).orElse(null);
        if (user == null) {
            user = users.findByEmail(UserAccount.normalizeEmail(identity.email()))
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NO_ACCOUNT",
                            "No DIGI-VOTE account uses this email. Register an organization or accept an invitation."));
            if (user.getFirebaseUid() != null) {
                throw ApiException.conflict("ALREADY_LINKED", "This DIGI-VOTE account is linked to a different sign-in");
            }
            if (user.getStatus() == UserStatus.PENDING_ACTIVATION) {
                throw new ApiException(HttpStatus.FORBIDDEN, "ACTIVATION_REQUIRED",
                        "Accept your invitation with its activation code first");
            }
            if (user.getStatus() != UserStatus.ACTIVE) {
                throw ApiException.forbidden("Account is not active");
            }
            user.linkFirebase(identity.uid(), now);
            audit.record(AuditEventType.AUTH_FIREBASE_LINKED, primaryOrganization(user.getId()), null, user.getId(),
                    Map.of("provider", String.valueOf(identity.signInProvider())));
        }
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw ApiException.forbidden("Account is not active");
        }
        user.recordSuccessfulLogin(now);
        audit.record(AuditEventType.AUTH_LOGIN_SUCCEEDED, primaryOrganization(user.getId()), null, user.getId(),
                Map.of("method", "firebase", "provider", String.valueOf(identity.signInProvider())));
        return session(user);
    }

    /** Creates an organization whose owner signs in with Firebase (no DIGI-VOTE password is stored). */
    @Transactional
    public AuthDtos.SessionResponse firebaseRegisterOrganization(AuthDtos.FirebaseRegisterOrganizationRequest request) {
        FirebaseIdentity identity = verifiedIdentity(request.idToken());
        Instant now = clock.instant();
        String email = UserAccount.normalizeEmail(identity.email());
        if (users.findByEmail(email).isPresent() || users.findByFirebaseUid(identity.uid()).isPresent()) {
            throw ApiException.conflict("EMAIL_IN_USE", "A DIGI-VOTE account already uses this email; sign in instead");
        }
        UserAccount owner = new UserAccount(dvNumbers.next(), email, request.fullName().trim(), UserStatus.ACTIVE, now);
        owner.linkFirebase(identity.uid(), now);
        owner.recordSuccessfulLogin(now);
        Organization org = createOrganizationWithOwner(request.organizationName(), request.organizationDescription(),
                request.organizationType(), users.save(owner), now);
        audit.record(AuditEventType.AUTH_FIREBASE_LINKED, org.getId(), null, owner.getId(),
                Map.of("provider", String.valueOf(identity.signInProvider())));
        return session(owner);
    }

    /**
     * Accepts an invitation with a Firebase identity. Requires the invitation code AND a Firebase-verified email
     * equal to the invited email, so possession of the mailbox and of the code are both proven.
     */
    @Transactional
    public AuthDtos.SessionResponse firebaseActivate(AuthDtos.FirebaseActivateRequest request) {
        FirebaseIdentity identity = verifiedIdentity(request.idToken());
        Instant now = clock.instant();
        String email = UserAccount.normalizeEmail(identity.email());
        UserAccount user = users.findByEmail(email).orElseThrow(() -> invalidActivation(email));
        Membership membership = pendingMembership(user, request.activationCode(), now).orElseThrow(() -> invalidActivation(email));
        users.findByFirebaseUid(identity.uid()).filter(other -> !other.getId().equals(user.getId())).ifPresent(other -> {
            throw ApiException.conflict("ALREADY_LINKED", "This sign-in is already linked to another DIGI-VOTE account");
        });
        if (user.getFirebaseUid() != null && !user.getFirebaseUid().equals(identity.uid())) {
            throw ApiException.conflict("ALREADY_LINKED", "This DIGI-VOTE account is linked to a different sign-in");
        }
        if (user.getFirebaseUid() == null) {
            user.linkFirebase(identity.uid(), now);
        }
        if (user.getStatus() == UserStatus.PENDING_ACTIVATION) {
            user.activate(request.fullName(), now);
        }
        membership.activate(now);
        user.recordSuccessfulLogin(now);
        audit.record(AuditEventType.AUTH_ACCOUNT_ACTIVATED, membership.getOrganizationId(), null, user.getId(),
                Map.of("role", membership.getRole().name(), "provider", String.valueOf(identity.signInProvider())));
        return session(user);
    }

    private FirebaseIdentity verifiedIdentity(String idToken) {
        FirebaseIdentity identity;
        try {
            identity = firebase.verify(idToken);
        } catch (ApiException e) {
            if (!"FIREBASE_DISABLED".equals(e.getCode())) {
                securityEvents.record(null, SecurityEvent.Type.INVALID_TOKEN, SecurityEvent.Severity.MEDIUM, null,
                        "Firebase ID token rejected: " + e.getCode());
            }
            throw e;
        }
        if (identity.email() == null || !identity.emailVerified()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED",
                    "Verify your email address (check your inbox) before using DIGI-VOTE");
        }
        return identity;
    }

    private java.util.Optional<Membership> pendingMembership(UserAccount user, String code, Instant now) {
        String codeHash = Hashing.sha256Hex(normalizeCode(code));
        return memberships.findByUserId(user.getId()).stream()
                .filter(m -> m.getStatus() == Membership.Status.INVITED)
                .filter(m -> Hashing.constantTimeEquals(m.getActivationCodeHash(), codeHash))
                .filter(m -> m.getActivationExpiresAt() != null && m.getActivationExpiresAt().isAfter(now))
                .findFirst();
    }

    private ApiException invalidActivation(String email) {
        securityEvents.record(null, SecurityEvent.Type.AUTH_FAILURE, SecurityEvent.Severity.LOW,
                SecurityEventService.principalRef(email), "Invalid activation attempt");
        return ApiException.badRequest("INVALID_ACTIVATION", "Invalid or expired activation code for this email");
    }

    private Organization createOrganizationWithOwner(String name, String description, OrganizationType type,
                                                     UserAccount owner, Instant now) {
        Organization org = new Organization(name.trim(), uniqueSlug(name), description, now);
        org.setOrgType(type);
        org = organizations.save(org);
        memberships.save(new Membership(org.getId(), owner.getId(), RoleCode.ORG_OWNER, Membership.Status.ACTIVE,
                null, now));
        audit.record(AuditEventType.ORG_REGISTERED, org.getId(), null, owner.getId(), Map.of("organization", org.getName()));
        return org;
    }

    @Transactional
    public void changePassword(UserAccount user, AuthDtos.ChangePasswordRequest request) {
        if (user.passwordHash() == null) {
            throw ApiException.badRequest("FIREBASE_ACCOUNT",
                    "This account signs in with Firebase; use \"Forgot password\" on the sign-in page");
        }
        if (!passwordEncoder.matches(request.currentPassword(), user.passwordHash())) {
            throw ApiException.badRequest("WRONG_PASSWORD", "Current password is incorrect");
        }
        validatePassword(request.newPassword(), strictestMinLength(user.getId()), anyRequiresMixedCase(user.getId()));
        UserAccount managed = users.findById(user.getId()).orElseThrow();
        managed.setPasswordHash(passwordEncoder.encode(request.newPassword()), clock.instant());
        audit.record(AuditEventType.AUTH_PASSWORD_CHANGED, primaryOrganization(user.getId()), null, user.getId(),
                Map.of());
    }

    @Transactional
    public AuthDtos.MeResponse updateProfile(UserAccount user, AuthDtos.UpdateProfileRequest request) {
        UserAccount managed = users.findById(user.getId()).orElseThrow();
        managed.updateProfile(request.fullName().trim(), request.mobileNumber(), clock.instant());
        return me(managed);
    }

    @Transactional(readOnly = true)
    public AuthDtos.MeResponse me(UserAccount user) {
        List<AuthDtos.MembershipView> views = memberships.findByUserId(user.getId()).stream()
                .filter(m -> m.getStatus() == Membership.Status.ACTIVE)
                .map(m -> {
                    Organization org = organizations.findById(m.getOrganizationId()).orElseThrow();
                    User role = userFactory.create(user, m);
                    return new AuthDtos.MembershipView(m.getId(), org.getId(), org.getName(), org.getSlug(),
                            org.getOrgType(), org.getPrimaryColor(), m.getRole(), m.getStatus().name(), role.homePath(),
                            role.grantedPermissions(), role.dashboardSections());
                })
                .toList();
        return new AuthDtos.MeResponse(user.getId(), user.getDvNumber(), user.getEmail(), user.getFullName(), user.getMobileNumber(),
                user.getLastLoginAt(), user.getFirebaseUid() != null, user.passwordHash() != null, views);
    }

    /** Session (token + profile) for an account that has just been created or authenticated elsewhere. */
    public AuthDtos.SessionResponse sessionFor(UserAccount user) {
        return session(user);
    }

    private AuthDtos.SessionResponse session(UserAccount user) {
        JwtService.IssuedToken token = jwtService.issue(user, sessionLength(user.getId()));
        return new AuthDtos.SessionResponse(token.token(), token.expiresAt(), me(user));
    }

    public static String normalizeCode(String code) {
        return code.replace("-", "").trim().toUpperCase(Locale.ROOT);
    }

    public static void validatePassword(String password, int minLength) {
        validatePassword(password, minLength, false);
    }

    public static void validatePassword(String password, int minLength, boolean requireMixedCase) {
        if (password == null || password.length() < minLength) {
            throw ApiException.badRequest("WEAK_PASSWORD", "Password must be at least " + minLength + " characters");
        }
        boolean letter = password.chars().anyMatch(Character::isLetter);
        boolean digit = password.chars().anyMatch(Character::isDigit);
        if (!letter || !digit) {
            throw ApiException.badRequest("WEAK_PASSWORD", "Password must contain letters and digits");
        }
        if (requireMixedCase && (password.chars().noneMatch(Character::isUpperCase)
                || password.chars().noneMatch(Character::isLowerCase))) {
            throw ApiException.badRequest("WEAK_PASSWORD", "Password must contain upper- and lower-case letters and a digit");
        }
    }

    private Long primaryOrganization(Long userId) {
        return memberships.findByUserId(userId).stream().findFirst().map(Membership::getOrganizationId).orElse(null);
    }

    private int maxFailures(Long userId) {
        return memberships.findByUserId(userId).stream()
                .map(m -> organizations.findById(m.getOrganizationId()).map(Organization::getMaxFailedLogins).orElse(5))
                .min(Integer::compare).orElse(5);
    }

    /** Longest lockout of any organization the user belongs to (the strictest policy wins). */
    private Duration lockoutDuration(Long userId) {
        return Duration.ofMinutes(memberships.findByUserId(userId).stream()
                .map(m -> organizations.findById(m.getOrganizationId()).map(Organization::getLockoutMinutes).orElse(15))
                .max(Integer::compare).orElse(15));
    }

    /** Shortest session of any organization the user belongs to, never longer than the server-wide limit. */
    private Duration sessionLength(Long userId) {
        return Duration.ofMinutes(memberships.findByUserId(userId).stream()
                .map(m -> organizations.findById(m.getOrganizationId()).map(Organization::getSessionMinutes).orElse(120))
                .min(Integer::compare).orElse(120));
    }

    private boolean anyRequiresMixedCase(Long userId) {
        return memberships.findByUserId(userId).stream()
                .anyMatch(m -> organizations.findById(m.getOrganizationId()).map(Organization::isRequireMixedCase).orElse(false));
    }

    private int strictestMinLength(Long userId) {
        return memberships.findByUserId(userId).stream()
                .map(m -> organizations.findById(m.getOrganizationId()).map(Organization::getPasswordMinLength).orElse(10))
                .max(Integer::compare).orElse(10);
    }

    private String uniqueSlug(String name) {
        String base = Normalizer.normalize(name, Normalizer.Form.NFD)
                .replaceAll("[^\\p{ASCII}]", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        if (base.isBlank()) {
            base = "org";
        }
        base = base.length() > 60 ? base.substring(0, 60) : base;
        String slug = base;
        int i = 2;
        while (organizations.existsBySlug(slug)) {
            slug = base + "-" + i++;
        }
        return slug;
    }
}
