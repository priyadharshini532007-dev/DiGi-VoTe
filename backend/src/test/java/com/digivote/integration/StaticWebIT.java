package com.digivote.integration;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** The HTML prototype (web/) is public and read-only; the API and management endpoints stay protected. */
class StaticWebIT extends IntegrationTestBase {

    @Test
    void prototypeIsServedWithoutAuthentication() throws Exception {
        var res = mvc.perform(get("/index.html")).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(200);
        assertThat(res.getContentAsString()).contains("DigiVote");
    }

    @Test
    void unknownStaticPathsAre404NotForbidden() throws Exception {
        assertThat(mvc.perform(get("/no-such-file.js")).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void staticServingDoesNotOpenTheApiOrWrites() throws Exception {
        assertThat(getRaw("/api/auth/me", null).status()).isEqualTo(401);
        assertThat(mvc.perform(post("/index.html")).andReturn().getResponse().getStatus()).isIn(401, 403, 405);
        assertThat(mvc.perform(get("/actuator/env")).andReturn().getResponse().getStatus()).isIn(401, 403, 404);
    }
}
