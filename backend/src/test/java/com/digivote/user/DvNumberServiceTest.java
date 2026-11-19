package com.digivote.user;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DvNumberServiceTest {

    @Test
    void formatsPerYearSequences() {
        assertThat(DvNumberService.format(2026, 1)).isEqualTo("DV-2026-00001");
        assertThat(DvNumberService.format(2026, 123456)).isEqualTo("DV-2026-123456");
    }

    @Test
    void normalizesWhatUsersType() {
        assertThat(DvNumberService.normalize(" dv-2026-00003 ")).isEqualTo("DV-2026-00003");
        assertThat(DvNumberService.normalize("DV-2026- 00003")).isEqualTo("DV-2026-00003");
    }

    @Test
    void rejectsAnythingElse() {
        assertThat(DvNumberService.normalize(null)).isNull();
        assertThat(DvNumberService.normalize("")).isNull();
        assertThat(DvNumberService.normalize("owner@example.org")).isNull();
        assertThat(DvNumberService.normalize("DV-26-1")).isNull();
        assertThat(DvNumberService.normalize("DV20260003")).isNull();
        assertThat(DvNumberService.normalize("DV-2026-0003; DROP")).isNull();
    }
}
