package com.digivote.integration;

import com.digivote.common.ApiException;
import com.digivote.crypto.SecureTokens;
import com.digivote.firebase.FirebaseIdentity;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

/**
 * Firebase sign-in, registration, invitation activation and account-linking rules. The Admin SDK token
 * verification is replaced by a mock here; real verification is exercised against the Auth emulator by
 * scripts/firebase-auth-e2e.mjs.
 */
class FirebaseAuthIT extends IntegrationTestBase {

    @BeforeEach
    void resetGateway() {
        reset(firebaseGateway);
        when(firebaseGateway.isEnabled()).thenReturn(true);
        when(firebaseGateway.verify(anyString())).thenThrow(
                new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_TOKEN_INVALID", "Invalid Firebase ID token"));
    }

    private String token(String uid, String email, boolean verified, String provider) {
        String t = "tok-" + SecureTokens.randomBase32(10);
        doReturn(new FirebaseIdentity(uid, email, verified, provider)).when(firebaseGateway).verify(eq(t));
        return t;
    }

    private static String uid() {
        return "uid-" + SecureTokens.randomBase32(12);
    }

    private static String email(String p) {
        return p + "." + SecureTokens.randomBase32(8).toLowerCase() + "@fb.digivote.test";
    }

    private Response registerOrg(String idToken) throws Exception {
        return postRaw("/api/auth/firebase/register-organization", null,
                Map.of("idToken", idToken, "organizationName", "FB Org", "fullName", "Fiona Firebase"));
    }

    @Test
    void invalidAndExpiredTokensAreRejectedAndRecorded() throws Exception {
        Response invalid = postRaw("/api/auth/firebase", null, Map.of("idToken", "garbage"));
        assertThat(invalid.status()).isEqualTo(401);
        assertThat(invalid.code()).isEqualTo("FIREBASE_TOKEN_INVALID");
        doThrow(new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_TOKEN_EXPIRED",
                "Your Firebase sign-in has expired; sign in again")).when(firebaseGateway).verify("expired");
        Response expired = postRaw("/api/auth/firebase", null, Map.of("idToken", "expired"));
        assertThat(expired.code()).isEqualTo("FIREBASE_TOKEN_EXPIRED");
        assertThat(count("SELECT COUNT(*) FROM security_events WHERE event_type = 'INVALID_TOKEN' "
                + "AND detail LIKE 'Firebase ID token rejected%'")).isGreaterThanOrEqualTo(2);
    }

    @Test
    void unverifiedEmailsAreNeverUsed() throws Exception {
        String e = email("unverified");
        String t = token(uid(), e, false, "password");
        assertThat(registerOrg(t).code()).isEqualTo("EMAIL_NOT_VERIFIED");
        assertThat(postRaw("/api/auth/firebase", null, Map.of("idToken", t)).code()).isEqualTo("EMAIL_NOT_VERIFIED");
        assertThat(count("SELECT COUNT(*) FROM users WHERE email = ?", e)).isZero();
    }

    @Test
    void firebaseOwnerRegistersWithoutALocalPassword() throws Exception {
        String e = email("owner");
        String u = uid();
        Response r = registerOrg(token(u, e, true, "password"));
        assertThat(r.status()).isEqualTo(201);
        assertThat(r.body().at("/user/memberships/0/role").asText()).isEqualTo("ORG_OWNER");
        assertThat(r.body().at("/user/localPassword").asBoolean()).isFalse();
        assertThat(r.body().at("/user/firebaseLinked").asBoolean()).isTrue();
        assertThat(count("SELECT COUNT(*) FROM users WHERE email = ? AND password_hash IS NULL AND firebase_uid = ?", e, u))
                .isEqualTo(1);
        String session = r.body().get("token").asText();
        assertThat(postRaw("/api/auth/change-password", session,
                Map.of("currentPassword", "x", "newPassword", "abcdefgh12")).code()).isEqualTo("FIREBASE_ACCOUNT");
        assertThat(postRaw("/api/auth/login", null, Map.of("email", e, "password", "anything1")).status()).isEqualTo(401);
        // the same Firebase user signs in again; a second registration is refused
        JsonNode again = postOk("/api/auth/firebase", null, Map.of("idToken", token(u, e, true, "password")));
        assertThat(again.at("/user/email").asText()).isEqualTo(e);
        assertThat(registerOrg(token(u, e, true, "password")).code()).isEqualTo("EMAIL_IN_USE");
    }

    @Test
    void signInWithoutAnAccountIsRefused() throws Exception {
        Response r = postRaw("/api/auth/firebase", null, Map.of("idToken", token(uid(), email("nobody"), true, "google.com")));
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.code()).isEqualTo("NO_ACCOUNT");
    }

    @Test
    void existingPasswordAccountLinksOnceByVerifiedEmail() throws Exception {
        Scenario s = campaign();
        String e = uniqueEmail("voter1", s.suffix);
        String googleUid = uid();
        JsonNode linked = postOk("/api/auth/firebase", null, Map.of("idToken", token(googleUid, e, true, "google.com")));
        assertThat(linked.at("/user/memberships/0/role").asText()).isEqualTo("VOTER");
        assertThat(linked.at("/user/firebaseLinked").asBoolean()).isTrue();
        // the original password still works (no second account was created)
        assertThat(postRaw("/api/auth/login", null, Map.of("email", e, "password", PASSWORD)).status()).isEqualTo(200);
        assertThat(count("SELECT COUNT(*) FROM users WHERE email = ?", e)).isEqualTo(1);
        // a different Firebase identity claiming the same email cannot take the account over
        Response hijack = postRaw("/api/auth/firebase", null, Map.of("idToken", token(uid(), e, true, "password")));
        assertThat(hijack.status()).isEqualTo(409);
        assertThat(hijack.code()).isEqualTo("ALREADY_LINKED");
        // Firebase sign-in never grants more than the DIGI-VOTE membership allows
        String session = linked.get("token").asText();
        assertThat(postRaw("/api/orgs/" + s.orgId + "/elections", session, Map.of("title", "x")).status()).isEqualTo(403);
    }

    @Test
    void invitationsRequireTheCodeAndAMatchingVerifiedEmail() throws Exception {
        Scenario s = campaign();
        String invited = email("invitee");
        JsonNode inv = postOk("/api/orgs/" + s.orgId + "/members", s.owner,
                Map.of("email", invited, "fullName", "Invitee", "role", "VOTER"));
        String code = inv.get("activationCode").asText();
        String u = uid();

        // plain Firebase sign-in cannot bypass the invitation
        Response early = postRaw("/api/auth/firebase", null, Map.of("idToken", token(u, invited, true, "password")));
        assertThat(early.code()).isEqualTo("ACTIVATION_REQUIRED");
        assertThat(count("SELECT COUNT(*) FROM users WHERE email = ? AND firebase_uid IS NULL", invited)).isEqualTo(1);

        // unverified email, wrong code, or someone else's verified email are all refused
        assertThat(postRaw("/api/auth/firebase/activate", null, Map.of("idToken", token(u, invited, false, "password"),
                "activationCode", code, "fullName", "Invitee")).code()).isEqualTo("EMAIL_NOT_VERIFIED");
        assertThat(postRaw("/api/auth/firebase/activate", null, Map.of("idToken", token(u, invited, true, "password"),
                "activationCode", "ZZZZ-ZZZZ-ZZZZ", "fullName", "Invitee")).code()).isEqualTo("INVALID_ACTIVATION");
        assertThat(postRaw("/api/auth/firebase/activate", null, Map.of("idToken", token(uid(), email("stranger"), true,
                "google.com"), "activationCode", code, "fullName", "Stranger")).code()).isEqualTo("INVALID_ACTIVATION");

        // the client cannot choose a role: extra fields are ignored, the invitation's role is used
        Response ok = postRaw("/api/auth/firebase/activate", null, Map.of("idToken", token(u, invited, true, "password"),
                "activationCode", code, "fullName", "Invitee", "role", "ORG_OWNER"));
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.body().at("/user/memberships/0/role").asText()).isEqualTo("VOTER");
        assertThat(ok.body().at("/user/localPassword").asBoolean()).isFalse();
        // the code is single-use
        assertThat(postRaw("/api/auth/firebase/activate", null, Map.of("idToken", token(u, invited, true, "password"),
                "activationCode", code, "fullName", "Invitee")).code()).isEqualTo("INVALID_ACTIVATION");
    }

    @Test
    void aFirebaseIdentityCannotBeLinkedToTwoAccounts() throws Exception {
        Scenario s = campaign();
        String u = uid();
        postOk("/api/auth/firebase", null, Map.of("idToken", token(u, uniqueEmail("voter1", s.suffix), true, "google.com")));
        String invited = email("second");
        String code = postOk("/api/orgs/" + s.orgId + "/members", s.owner,
                Map.of("email", invited, "fullName", "Second", "role", "VOTER")).get("activationCode").asText();
        // same uid now presenting a different verified email (e.g. changed in Firebase)
        Response r = postRaw("/api/auth/firebase/activate", null, Map.of("idToken", token(u, invited, true, "google.com"),
                "activationCode", code, "fullName", "Second"));
        assertThat(r.status()).isEqualTo(409);
        assertThat(r.code()).isEqualTo("ALREADY_LINKED");
    }

    @Test
    void firebaseIsReportedAsDisabledWhenNotConfigured() throws Exception {
        doThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "FIREBASE_DISABLED",
                "Firebase authentication is not configured on this server")).when(firebaseGateway).verify("any");
        assertThat(postRaw("/api/auth/firebase", null, Map.of("idToken", "any")).status()).isEqualTo(503);
    }
}
