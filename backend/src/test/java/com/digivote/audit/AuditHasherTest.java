package com.digivote.audit;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class AuditHasherTest {

    private final Instant t = Instant.parse("2026-10-10T10:00:00.123Z");

    @Test
    void hashIsDeterministicAndSensitiveToEveryField() {
        String base = AuditHasher.hash("ORG-1", 1, "e", "X", t, 1L, 2L, "user:3", "{}", AuditHasher.GENESIS);
        assertThat(base).hasSize(64).isEqualTo(AuditHasher.hash("ORG-1", 1, "e", "X", t, 1L, 2L, "user:3", "{}",
                AuditHasher.GENESIS));
        assertThat(AuditHasher.hash("ORG-1", 2, "e", "X", t, 1L, 2L, "user:3", "{}", AuditHasher.GENESIS)).isNotEqualTo(base);
        assertThat(AuditHasher.hash("ORG-1", 1, "e", "Y", t, 1L, 2L, "user:3", "{}", AuditHasher.GENESIS)).isNotEqualTo(base);
        assertThat(AuditHasher.hash("ORG-1", 1, "e", "X", t.plusMillis(1), 1L, 2L, "user:3", "{}", AuditHasher.GENESIS)).isNotEqualTo(base);
        assertThat(AuditHasher.hash("ORG-1", 1, "e", "X", t, 1L, 2L, "user:4", "{}", AuditHasher.GENESIS)).isNotEqualTo(base);
        assertThat(AuditHasher.hash("ORG-1", 1, "e", "X", t, 1L, 2L, "user:3", "{\"a\":1}", AuditHasher.GENESIS)).isNotEqualTo(base);
        assertThat(AuditHasher.hash("ORG-1", 1, "e", "X", t, 1L, 2L, "user:3", "{}", "1".repeat(64))).isNotEqualTo(base);
    }

    @Test
    void metadataIsSanitizedAndCanonical() {
        AuditService service = new AuditService(mock(AuditLogRepository.class), mock(AuditChainHeadRepository.class),
                Clock.systemUTC());
        String json = service.sanitize(Map.of("zeta", 1, "alpha", "x", "password", "p", "selection", 2,
                "tokenHex", "abc", "receiptCode", "r"));
        assertThat(json).isEqualTo("{\"alpha\":\"x\",\"zeta\":1}");
    }
}
