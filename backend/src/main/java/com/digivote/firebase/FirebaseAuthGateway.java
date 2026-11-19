package com.digivote.firebase;

import com.digivote.common.ApiException;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Verifies Firebase ID tokens server-side with the Admin SDK: signature, issuer, audience (project id),
 * expiry, and revocation ({@code checkRevoked = true}). When FIREBASE_AUTH_EMULATOR_HOST is set (local
 * testing only), the Admin SDK verifies tokens issued by the Auth emulator instead.
 */
@Component
public class FirebaseAuthGateway {

    private final ObjectProvider<FirebaseApp> firebaseApp;

    public FirebaseAuthGateway(ObjectProvider<FirebaseApp> firebaseApp) {
        this.firebaseApp = firebaseApp;
    }

    public boolean isEnabled() {
        return firebaseApp.getIfAvailable() != null;
    }

    public FirebaseIdentity verify(String idToken) {
        FirebaseApp app = firebaseApp.getIfAvailable();
        if (app == null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "FIREBASE_DISABLED",
                    "Firebase authentication is not configured on this server");
        }
        try {
            FirebaseToken token = FirebaseAuth.getInstance(app).verifyIdToken(idToken, true);
            Object firebaseClaim = token.getClaims().get("firebase");
            String provider = firebaseClaim instanceof Map<?, ?> m && m.get("sign_in_provider") != null
                    ? m.get("sign_in_provider").toString() : null;
            return new FirebaseIdentity(token.getUid(), token.getEmail(), token.isEmailVerified(), provider);
        } catch (FirebaseAuthException e) {
            AuthErrorCode code = e.getAuthErrorCode();
            if (code == AuthErrorCode.EXPIRED_ID_TOKEN) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_TOKEN_EXPIRED",
                        "Your Firebase sign-in has expired; sign in again");
            }
            if (code == AuthErrorCode.REVOKED_ID_TOKEN) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_TOKEN_REVOKED",
                        "Your Firebase session was revoked; sign in again");
            }
            if (code == AuthErrorCode.USER_DISABLED) {
                throw new ApiException(HttpStatus.FORBIDDEN, "FIREBASE_USER_DISABLED", "This Firebase account is disabled");
            }
            throw new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_TOKEN_INVALID", "Invalid Firebase ID token");
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_TOKEN_INVALID", "Invalid Firebase ID token");
        }
    }
}
