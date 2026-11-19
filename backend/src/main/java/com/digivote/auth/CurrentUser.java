package com.digivote.auth;

import com.digivote.common.ApiException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

/** Reads the authenticated account id from the verified session token. */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static long id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            try {
                return Long.parseLong(jwt.getSubject());
            } catch (NumberFormatException e) {
                throw ApiException.unauthorized("Invalid session");
            }
        }
        throw ApiException.unauthorized("Authentication required");
    }
}
