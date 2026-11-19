package com.digivote.auth;

import com.digivote.config.DigiVoteProperties;
import com.digivote.crypto.KeyVault;
import com.digivote.user.UserAccount;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/**
 * Issues and verifies DIGI-VOTE session tokens (HS256 JWT). Roles are not embedded: authorization is
 * resolved server-side from current memberships on every request, so revocations take effect at once.
 */
@Service
public class JwtService {

    public static final String ISSUER = "digi-vote";

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final Clock clock;
    private final Duration ttl;

    public JwtService(DigiVoteProperties properties, Clock clock) {
        SecretKey key = new SecretKeySpec(secret(properties), "HmacSHA256");
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        NimbusJwtDecoder nimbus = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        this.decoder = nimbus;
        this.clock = clock;
        this.ttl = Duration.ofMinutes(properties.security().jwtTtlMinutes());
    }

    public IssuedToken issue(UserAccount user) {
        return issue(user, ttl);
    }

    /** @param sessionLength the organization-policy session length; capped by the server-wide token lifetime */
    public IssuedToken issue(UserAccount user, Duration sessionLength) {
        Instant now = clock.instant();
        Instant expires = now.plus(sessionLength.compareTo(ttl) < 0 ? sessionLength : ttl);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(expires)
                .id(UUID.randomUUID().toString())
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new IssuedToken(token, expires);
    }

    public JwtDecoder decoder() {
        return decoder;
    }

    public record IssuedToken(String token, Instant expiresAt) {
    }

    private static byte[] secret(DigiVoteProperties properties) {
        String configured = properties.security().jwtSecret();
        if (configured != null && !configured.isBlank()) {
            byte[] bytes = configured.length() >= 44 && configured.matches("^[A-Za-z0-9+/=]+$")
                    ? Base64.getDecoder().decode(configured)
                    : configured.getBytes(StandardCharsets.UTF_8);
            if (bytes.length < 32) {
                throw new IllegalStateException("DIGIVOTE_JWT_SECRET must be at least 32 bytes");
            }
            return bytes;
        }
        if (!properties.devMode()) {
            throw new IllegalStateException("DIGIVOTE_JWT_SECRET is required when dev mode is off");
        }
        return KeyVault.devSecret(properties, "dev-jwt.key", 32);
    }
}
