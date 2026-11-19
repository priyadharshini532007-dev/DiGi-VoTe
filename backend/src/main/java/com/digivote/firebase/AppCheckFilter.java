package com.digivote.firebase;

import com.digivote.audit.SecurityEvent;
import com.digivote.audit.SecurityEventService;
import com.digivote.config.DigiVoteProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Firebase App Check enforcement for abuse-prone endpoints (login, registration, ballot submission).
 * Enabled with FIREBASE_APP_CHECK_ENABLED=true. App Check tokens are RS256 JWTs verified against
 * Google's public JWKS; issuer and audience must name this Firebase project.
 */
@Component
@Order(1)
@ConditionalOnProperty(prefix = "digivote.firebase", name = "app-check-enabled", havingValue = "true")
public class AppCheckFilter extends OncePerRequestFilter {

    private static final String JWKS = "https://firebaseappcheck.googleapis.com/v1/jwks";

    private final NimbusJwtDecoder decoder;
    private final SecurityEventService securityEvents;

    public AppCheckFilter(DigiVoteProperties properties, SecurityEventService securityEvents) {
        String projectNumber = properties.firebase().projectNumber();
        if (projectNumber == null || projectNumber.isBlank()) {
            throw new IllegalStateException("FIREBASE_PROJECT_NUMBER is required for App Check");
        }
        this.decoder = NimbusJwtDecoder.withJwkSetUri(JWKS).jwsAlgorithm(SignatureAlgorithm.RS256).build();
        OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience().contains("projects/" + projectNumber)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_audience"));
        this.decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer("https://firebaseappcheck.googleapis.com/" + projectNumber),
                audience));
        this.securityEvents = securityEvents;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !"POST".equals(request.getMethod())
                || !(path.startsWith("/api/auth/") || path.matches("/api/public/elections/\\d+/ballots"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String token = request.getHeader("X-Firebase-AppCheck");
        try {
            if (token == null) {
                throw new JwtException("missing");
            }
            decoder.decode(token);
        } catch (JwtException e) {
            securityEvents.record(null, SecurityEvent.Type.APP_CHECK_FAILED, SecurityEvent.Severity.MEDIUM, null,
                    "App Check token missing or invalid on " + request.getRequestURI());
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "App Check verification failed");
            return;
        }
        chain.doFilter(request, response);
    }
}
