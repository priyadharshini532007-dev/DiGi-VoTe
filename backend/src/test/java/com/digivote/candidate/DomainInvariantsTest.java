package com.digivote.candidate;

import com.digivote.candidate.storage.MediaStorage;
import com.digivote.candidate.storage.ValidatingMediaStorage;
import com.digivote.common.ApiException;
import com.digivote.election.CountingMethod;
import com.digivote.result.ElectionResult;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class DomainInvariantsTest {

    private final Instant now = Instant.now();

    @Test
    void frozenManifestoRefusesEveryChange() {
        Manifesto m = new Manifesto(1L, now);
        m.edit("v", "m", "g", "s", now);
        m.publish(now);
        m.freeze(now);
        assertThat(m.isFrozen()).isTrue();
        assertThatThrownBy(() -> m.edit("x", null, null, null, now)).isInstanceOf(ApiException.class)
                .hasMessageContaining("frozen");
        assertThatThrownBy(() -> m.publish(now)).isInstanceOf(ApiException.class);
    }

    @Test
    void emptyManifestoCannotBePublished() {
        assertThatThrownBy(() -> new Manifesto(1L, now).publish(now)).hasMessageContaining("Write the manifesto");
    }

    @Test
    void publishedResultsAreImmutable() {
        ElectionResult r = new ElectionResult(1L, CountingMethod.PLURALITY, 1L, now);
        r.record(3, 3, "h", false, "hash", 1L, now);
        r.record(3, 3, "h", false, "hash", 1L, now);
        assertThat(r.getGenerationCount()).isEqualTo(2);
        r.publish(1L, now);
        assertThatThrownBy(() -> r.record(4, 4, "h2", false, "x", 1L, now)).hasMessageContaining("Published results");
        assertThatThrownBy(() -> r.publish(1L, now)).isInstanceOf(ApiException.class);
    }

    @Test
    void applicationWorkflowGuards() {
        CandidateApplication a = new CandidateApplication(1L, 2L, "N", "S", null, null, now);
        a.review(CandidateApplication.Status.CORRECTION_REQUESTED, "fix", 9L, now);
        assertThatThrownBy(() -> a.review(CandidateApplication.Status.APPROVED, null, 9L, now))
                .isInstanceOf(IllegalStateException.class);
        a.revise("N2", "S2", null, null, now);
        a.review(CandidateApplication.Status.APPROVED, null, 9L, now);
        assertThatThrownBy(() -> a.revise("x", "y", null, null, now)).isInstanceOf(IllegalStateException.class);
        a.withdraw(now);
        assertThatThrownBy(() -> a.withdraw(now)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void maliciousUploadsAreRejected() {
        ValidatingMediaStorage storage = new ValidatingMediaStorage(mock(MediaStorage.class), 1024);
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0};
        assertThat(storage.validate(ValidatingMediaStorage.Kind.IMAGE, "image/png", png)).isEqualTo("image/png");
        byte[] html = "<html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> storage.validate(ValidatingMediaStorage.Kind.IMAGE, "image/png", html))
                .hasMessageContaining("does not match");
        byte[] svg = "<svg onload=alert(1)></svg>".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> storage.validate(ValidatingMediaStorage.Kind.IMAGE, "image/svg+xml", svg))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> storage.validate(ValidatingMediaStorage.Kind.PDF, "application/pdf", png))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> storage.validate(ValidatingMediaStorage.Kind.IMAGE, "image/png", new byte[2048]))
                .hasMessageContaining("exceeds");
        assertThatThrownBy(() -> storage.validate(ValidatingMediaStorage.Kind.IMAGE, "image/png", new byte[0]))
                .hasMessageContaining("empty");
        byte[] pdf = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
        assertThat(storage.validate(ValidatingMediaStorage.Kind.PDF, "application/pdf", pdf)).isEqualTo("application/pdf");
    }
}
