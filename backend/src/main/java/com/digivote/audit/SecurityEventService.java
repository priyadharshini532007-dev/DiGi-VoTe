package com.digivote.audit;

import com.digivote.common.Hashing;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Map;

/**
 * Records security events in their own transaction so they persist even when the triggering request
 * fails. Principals are stored as a salted-free SHA-256 prefix of the email (pseudonymous reference),
 * never as plaintext credentials.
 */
@Service
public class SecurityEventService {

    private static final Logger log = LoggerFactory.getLogger(SecurityEventService.class);

    private final SecurityEventRepository repository;
    private final AuditService audit;
    private final Clock clock;

    public SecurityEventService(SecurityEventRepository repository, AuditService audit, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.clock = clock;
    }

    public static String principalRef(String email) {
        return email == null ? null : "email-sha256:" + Hashing.sha256Hex(email.trim().toLowerCase()).substring(0, 16);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long organizationId, SecurityEvent.Type type, SecurityEvent.Severity severity,
                       String principalRef, String detail) {
        repository.save(new SecurityEvent(organizationId, type, severity, principalRef, detail, clock.instant()));
        audit.record(AuditEventType.SECURITY_EVENT, organizationId, null, null,
                Map.of("type", type.name(), "severity", severity.name()));
        log.info("Security event {} ({})", type, severity);
    }
}
