package com.digivote.firebase;

/**
 * Identity asserted by a verified Firebase ID token.
 *
 * @param signInProvider Firebase's {@code firebase.sign_in_provider} claim, e.g. "password" or "google.com"
 */
public record FirebaseIdentity(String uid, String email, boolean emailVerified, String signInProvider) {
}
