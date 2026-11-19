package com.digivote.candidate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class CandidateDtos {

    private CandidateDtos() {
    }

    public record ApplicationRequest(@NotBlank @Size(max = 120) String displayName,
                                     @NotBlank @Size(max = 2000) String statement,
                                     @Size(max = 2000) String qualifications,
                                     @Size(max = 2000) String achievements,
                                     @Size(max = 2000) String education,
                                     @Size(max = 2000) String experience) {
    }

    public enum Decision { APPROVE, REJECT, REQUEST_CORRECTION }

    public record ReviewRequest(@NotNull Decision decision, @Size(max = 1000) String note) {
    }

    public record ApplicationView(Long id, Long electionId, String electionTitle, String applicantName,
                                  String applicantEmail, String displayName, String statement, String qualifications,
                                  String achievements, String status, String reviewerNote, Instant submittedAt,
                                  Instant reviewedAt, Long candidateId, Long applicantUserId, String education,
                                  String experience) {
    }

    public record ProfileRequest(@NotBlank @Size(max = 120) String displayName,
                                 @Size(max = 2000) String qualifications,
                                 @Size(max = 2000) String achievements,
                                 @Size(max = 2000) String education,
                                 @Size(max = 2000) String experience) {
    }

    public record ManifestoRequest(@Size(max = 4000) String vision, @Size(max = 4000) String mission,
                                   @Size(max = 4000) String goals, @Size(max = 4000) String schemes,
                                   @Size(max = 4000) String initiatives) {
    }

    public record ManifestoView(Long id, Long candidateId, String vision, String mission, String goals,
                                String schemes, String initiatives, String status, boolean frozen, Instant frozenAt,
                                Instant publishedAt, Instant updatedAt) {
        static ManifestoView of(Manifesto m) {
            return new ManifestoView(m.getId(), m.getCandidateId(), m.getVision(), m.getMission(), m.getGoals(),
                    m.getSchemes(), m.getInitiatives(), m.getStatus().name(), m.isFrozen(), m.getFrozenAt(), m.getPublishedAt(),
                    m.getUpdatedAt());
        }
    }

    public record MediaView(Long id, String mediaType, String originalFilename, String contentType, long sizeBytes,
                            String sha256, Instant uploadedAt, String url) {
        static MediaView of(CandidateMedia m) {
            return new MediaView(m.getId(), m.getMediaType().name(), m.getOriginalFilename(), m.getContentType(),
                    m.getSizeBytes(), m.getSha256(), m.getUploadedAt(), "/api/media/" + m.getId());
        }
    }

    public record CandidateView(Long id, Long electionId, String displayName, String qualifications,
                                String achievements, String education, String experience, int ballotPosition,
                                String status, String photoUrl, boolean mine, ManifestoView manifesto,
                                List<MediaView> media) {
    }
}
