package com.digivote.auth;

import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.candidate.storage.ValidatingMediaStorage;
import com.digivote.common.ApiException;
import com.digivote.crypto.KeyVault;
import com.digivote.crypto.SecureTokens;
import com.digivote.common.Hashing;
import com.digivote.organization.Membership;
import com.digivote.organization.MembershipRepository;
import com.digivote.organization.Organization;
import com.digivote.organization.OrganizationRepository;
import com.digivote.organization.RoleCode;
import com.digivote.user.DvNumberService;
import com.digivote.user.IdentityProfile;
import com.digivote.user.IdentityProfileRepository;
import com.digivote.user.UserAccount;
import com.digivote.user.UserRepository;
import com.digivote.user.UserStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Voter self sign-up into the one organization this server is configured for (DIGIVOTE_SIGNUP_ORG_SLUG; empty =
 * disabled). Creates a login account with a DV number and an ACTIVE membership as Voter or Candidate; identity details
 * go to {@link IdentityProfile}. Signing up does NOT put anyone on an election's voter list: operators do that.
 */
@Service
public class SignupService {

    static final int MAX_PROOF_BYTES = 5 * 1024 * 1024;
    private static final Pattern EPIC = Pattern.compile("^[A-Z]{3}\\d{7}$");
    private static final Pattern AADHAAR = Pattern.compile("^[2-9]\\d{11}$");
    private static final Pattern MOBILE = Pattern.compile("^[6-9]\\d{9}$");

    private final UserRepository users;
    private final OrganizationRepository organizations;
    private final MembershipRepository memberships;
    private final IdentityProfileRepository profiles;
    private final PasswordEncoder passwordEncoder;
    private final DvNumberService dvNumbers;
    private final KeyVault vault;
    private final ValidatingMediaStorage storage;
    private final AuditService audit;
    private final Clock clock;
    private final String organizationSlug;

    public SignupService(UserRepository users, OrganizationRepository organizations, MembershipRepository memberships,
                         IdentityProfileRepository profiles, PasswordEncoder passwordEncoder, DvNumberService dvNumbers,
                         KeyVault vault, ValidatingMediaStorage storage, AuditService audit, Clock clock,
                         @Value("${digivote.signup.organization-slug:}") String organizationSlug) {
        this.users = users;
        this.organizations = organizations;
        this.memberships = memberships;
        this.profiles = profiles;
        this.passwordEncoder = passwordEncoder;
        this.dvNumbers = dvNumbers;
        this.vault = vault;
        this.storage = storage;
        this.audit = audit;
        this.clock = clock;
        this.organizationSlug = organizationSlug == null ? "" : organizationSlug.trim();
    }

    @Transactional
    public UserAccount register(SignupDtos.SignupRequest request, MultipartFile proof) {
        Organization org = targetOrganization();
        Instant now = clock.instant();

        LocalDate dob = request.dateOfBirth();
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        if (dob.isAfter(today) || Period.between(dob, today).getYears() < 18) {
            throw fieldError("dateOfBirth", "You must be at least 18 years old to register");
        }
        String mobile = normalizeMobile(request.mobileNumber());
        if (!MOBILE.matcher(mobile).matches()) {
            throw fieldError("mobileNumber", "Enter a valid 10-digit mobile number");
        }
        String idNumber = request.idNumber().toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        boolean idOk = request.idType() == SignupDtos.IdType.AADHAAR ? AADHAAR.matcher(idNumber).matches()
                : EPIC.matcher(idNumber).matches();
        if (!idOk) {
            throw fieldError("idNumber", request.idType() == SignupDtos.IdType.AADHAAR
                    ? "Aadhaar is 12 digits and does not start with 0 or 1"
                    : "Voter ID (EPIC) is 3 letters followed by 7 digits");
        }
        AuthService.validatePassword(request.password(), org.getPasswordMinLength(), org.isRequireMixedCase());

        String email = UserAccount.normalizeEmail(request.email());
        if (users.findByEmail(email).isPresent()) {
            throw ApiException.conflict("EMAIL_IN_USE", "An account with this email already exists. Log in instead.")
                    .withField("email", "An account with this email already exists. Log in instead.");
        }
        if (users.existsByMobileNumber(mobile)) {
            throw ApiException.conflict("MOBILE_IN_USE", "This mobile number is already registered")
                    .withField("mobileNumber", "This mobile number is already registered");
        }
        String idHash = idHash(request.idType().name(), idNumber);
        if (profiles.existsByIdNumberHash(idHash)) {
            throw ApiException.conflict("ID_IN_USE", "This ID is already registered to another account")
                    .withField("idNumber", "This ID is already registered to another account");
        }

        byte[] bytes = readProof(proof);
        String contentType = validateProof(proof.getContentType(), bytes);

        UserAccount user = new UserAccount(dvNumbers.next(), email, request.fullName().trim(), UserStatus.ACTIVE, now);
        user.setPasswordHash(passwordEncoder.encode(request.password()), now);
        user.updateProfile(user.getFullName(), mobile, now);
        user.recordSuccessfulLogin(now);
        user = users.save(user);

        // The scan is encrypted before it leaves this process; the provider only ever holds ciphertext.
        String sealed = vault.seal(Base64.getEncoder().encodeToString(bytes), "identity-proof:" + user.getId());
        String key = "identity/" + user.getId() + "/" + SecureTokens.randomBase32(20) + ".bin";
        storage.store(key, sealed.getBytes(StandardCharsets.UTF_8), "application/octet-stream");

        profiles.save(new IdentityProfile(user.getId(), request.gender(), dob, request.fatherName().trim(),
                request.motherName().trim(), request.address().trim(), request.idType().name(),
                vault.seal(idNumber, "identity-number:" + user.getId()), idHash,
                idNumber.substring(idNumber.length() - 4), key, contentType, bytes.length,
                Hashing.sha256Hex(new String(bytes, StandardCharsets.ISO_8859_1)), now));

        RoleCode role = request.role() == SignupDtos.SignupRole.CANDIDATE ? RoleCode.CANDIDATE : RoleCode.VOTER;
        memberships.save(new Membership(org.getId(), user.getId(), role, Membership.Status.ACTIVE, null, now));
        audit.record(AuditEventType.AUTH_SELF_REGISTERED, org.getId(), null, user.getId(),
                Map.of("role", role.name(), "idType", request.idType().name()));
        return user;
    }

    private Organization targetOrganization() {
        if (organizationSlug.isEmpty()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "SIGNUP_DISABLED", "Self sign-up is not enabled on this server");
        }
        return organizations.findBySlug(organizationSlug).filter(o -> "ACTIVE".equals(o.getStatus()))
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "SIGNUP_DISABLED",
                        "Self sign-up is not enabled on this server"));
    }

    private static String normalizeMobile(String raw) {
        String m = raw.replaceAll("[\\s-]", "");
        return m.replaceFirst("^(\\+?91)(?=\\d{10}$)", "");
    }

    private String idHash(String type, String number) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(vault.deriveKey("identity-number-hash"), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((type + "|" + number).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("ID hashing failed", e);
        }
    }

    private static byte[] readProof(MultipartFile proof) {
        if (proof == null || proof.isEmpty()) {
            throw fieldError("proof", "Upload a photo or scan of your ID");
        }
        try {
            return proof.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("UPLOAD_FAILED", "Could not read the uploaded file");
        }
    }

    private String validateProof(String declared, byte[] bytes) {
        if (bytes.length > MAX_PROOF_BYTES) {
            throw fieldError("proof", "The file is larger than 5 MB");
        }
        boolean pdf = declared != null && declared.toLowerCase(Locale.ROOT).startsWith("application/pdf");
        try {
            return storage.validate(pdf ? ValidatingMediaStorage.Kind.PDF : ValidatingMediaStorage.Kind.IMAGE, declared, bytes);
        } catch (ApiException e) {
            throw fieldError("proof", "Upload an image (JPG, PNG) or a PDF");
        }
    }

    private static ApiException fieldError(String field, String message) {
        return ApiException.badRequest("VALIDATION_FAILED", "Request validation failed").withField(field, message);
    }
}
