package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/** Optional election banner: PNG/JPEG only, small, managed by operators while details are editable. */
class ElectionBannerIT extends IntegrationTestBase {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};

    /** A new draft election in the scenario's organization: banners follow the "details editable" rule. */
    private long draft(Scenario s) throws Exception {
        return postOk("/api/orgs/" + s.orgId + "/elections", s.owner, Map.of("title", "Banner draft " + s.suffix, "description", "d")).get("id").asLong();
    }

    private int put(long electionId, String token, MockMultipartFile file) throws Exception {
        return mvc.perform(multipart(HttpMethod.PUT, "/api/elections/" + electionId + "/banner").file(file)
                .header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus();
    }

    @Test
    void operatorCanSetReadAndRemoveTheBanner() throws Exception {
        Scenario s = campaign();
        long id = draft(s);
        assertThat(getOk("/api/elections/" + id, s.owner).get("hasBanner").asBoolean()).isFalse();

        assertThat(put(id, s.owner, new MockMultipartFile("file", "b.png", "image/png", PNG))).isEqualTo(200);
        assertThat(getOk("/api/elections/" + id, s.owner).get("hasBanner").asBoolean()).isTrue();

        // drafts are invisible to ordinary members, so their banners are too
        assertThat(mvc.perform(get("/api/elections/" + id + "/banner").header("Authorization", "Bearer " + s.voter1))
                .andReturn().getResponse().getStatus()).isIn(403, 404);
        var res = mvc.perform(get("/api/elections/" + id + "/banner").header("Authorization", "Bearer " + s.owner))
                .andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(200);
        assertThat(res.getContentType()).isEqualTo("image/png");
        assertThat(res.getContentAsByteArray()).isEqualTo(PNG);
        assertThat(res.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");

        JsonNode removed = ok(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete("/api/elections/" + id + "/banner"), s.owner, null);
        assertThat(removed.get("hasBanner").asBoolean()).isFalse();
    }

    @Test
    void rejectsNonImagesOversizeFilesAndNonOperators() throws Exception {
        Scenario s = campaign();
        long id = draft(s);
        MockMultipartFile html = new MockMultipartFile("file", "b.png", "image/png",
                "<html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8));
        assertThat(put(id, s.owner, html)).isEqualTo(400);

        byte[] big = new byte[2 * 1024 * 1024 + 1];
        System.arraycopy(PNG, 0, big, 0, PNG.length);
        assertThat(put(id, s.owner, new MockMultipartFile("file", "b.png", "image/png", big))).isEqualTo(400);

        assertThat(put(id, s.voter1, new MockMultipartFile("file", "b.png", "image/png", PNG)))
                .isIn(403, 404);
        assertThat(count("SELECT COUNT(*) FROM elections WHERE id = ? AND banner_key IS NOT NULL", id)).isZero();
    }
}
