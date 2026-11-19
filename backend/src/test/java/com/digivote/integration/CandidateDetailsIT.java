package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/** Education, Experience and Initiatives round-trip through profiles and manifestos; applications expose the applicant id. */
class CandidateDetailsIT extends IntegrationTestBase {

    @Test
    void profileAndManifestoCarryTheExtraFields() throws Exception {
        Scenario s = campaign();
        long cid = s.candidateIds.get(0);
        String token = s.candidates.get(0);

        Map<String, Object> profile = new HashMap<>();
        profile.put("displayName", "Updated Name");
        profile.put("qualifications", "B.A. Economics");
        profile.put("achievements", "Led a campus drive");
        profile.put("education", "B.A. Economics (final year)");
        profile.put("experience", "Class representative, 2 years");
        JsonNode view = putOk("/api/candidates/" + cid + "/profile", token, profile);
        assertThat(view.get("education").asText()).isEqualTo("B.A. Economics (final year)");
        assertThat(view.get("experience").asText()).isEqualTo("Class representative, 2 years");

        JsonNode m = putOk("/api/candidates/" + cid + "/manifesto", token, Map.of("vision", "A campus that listens",
                "mission", "Open meetings", "goals", "1. Forums", "schemes", "Mentoring", "initiatives", "Online suggestion box"));
        assertThat(m.get("initiatives").asText()).isEqualTo("Online suggestion box");
        assertThat(getOk("/api/candidates/" + cid, token).get("manifesto").get("initiatives").asText())
                .isEqualTo("Online suggestion box");
    }

    @Test
    void applicationsExposeApplicantIdAndBackground() throws Exception {
        Scenario s = campaign();
        JsonNode mine = getOk("/api/me/applications", s.candidates.get(0));
        long myId = getOk("/api/auth/me", s.candidates.get(0)).get("id").asLong();
        assertThat(mine.get(0).get("applicantUserId").asLong()).isEqualTo(myId);
        JsonNode all = getOk("/api/elections/" + s.electionId + "/applications", s.owner);
        assertThat(all.get(0).has("applicantUserId")).isTrue();
    }

    @Test
    void candidatesCanAttachSupportingDocumentsAndRemoveTheirOwnFiles() throws Exception {
        Scenario s = campaign();
        long cid = s.candidateIds.get(0);
        byte[] pdf = {'%', 'P', 'D', 'F', '-', '1', '.', '4', '\n'};
        var up = mvc.perform(multipart("/api/candidates/" + cid + "/media").file(new MockMultipartFile("file", "cv.pdf", "application/pdf", pdf))
                .param("type", "SUPPORTING_DOCUMENT").header("Authorization", "Bearer " + s.candidates.get(0))).andReturn().getResponse();
        assertThat(up.getStatus()).isEqualTo(201);
        long mediaId = json.readTree(up.getContentAsString()).get("id").asLong();

        // another candidate cannot remove it
        assertThat(call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/media/" + mediaId),
                s.candidates.get(1), null).status()).isIn(403, 404);
        assertThat(count("SELECT COUNT(*) FROM candidate_media WHERE id = ?", mediaId)).isEqualTo(1);

        assertThat(call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/media/" + mediaId),
                s.candidates.get(0), null).status()).isEqualTo(204);
        assertThat(count("SELECT COUNT(*) FROM candidate_media WHERE id = ?", mediaId)).isZero();
    }
}
