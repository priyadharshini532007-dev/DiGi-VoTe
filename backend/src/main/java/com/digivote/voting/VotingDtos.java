package com.digivote.voting;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

public final class VotingDtos {

    private VotingDtos() {
    }

    public record AddVotersRequest(@NotEmpty @Size(max = 2000) List<@NotBlank @Size(max = 254) String> emails) {
    }

    public record AddVotersResult(int added, int alreadyEligible, List<String> rejected) {
    }

    public record EligibleVoterView(Long id, Long userId, String fullName, String email, String role, String status,
                                    boolean credentialIssued, Instant addedAt) {
    }

    public record EligibilityView(Long electionId, boolean eligible, boolean mayVote, boolean votingOpen,
                                  boolean credentialIssued, List<String> reasons) {
    }

    /**
     * The election's single credential-signing public key. {@code fingerprint} is the canonical v1 fingerprint
     * ({@link com.digivote.crypto.CredentialKeyFingerprint}); {@code storageFingerprint} is the legacy
     * SHA-256("n:e") value recorded on issued credentials.
     */
    public record CredentialKeyView(Long electionId, String version, String protocol, String modulusHex,
                                    String publicExponentHex, String fingerprint, String storageFingerprint,
                                    String fdhDomain, int modulusBits) {
    }

    public record CredentialRequest(
            @NotBlank @Size(max = 2048) @Pattern(regexp = "^[0-9a-fA-F]+$") String blindedMessageHex) {
    }

    public record CredentialResponse(Long electionId, String blindSignatureHex, String keyFingerprint,
                                     boolean replayed) {
    }

    public record BallotOptionView(int index, Long candidateId, String label, boolean nota, String photoUrl) {
    }

    public record BallotView(Long electionId, String title, int maxSelections, boolean notaEnabled,
                             Instant votingEnd, List<BallotOptionView> options) {
    }

    public record CastBallotRequest(
            @NotBlank @Pattern(regexp = "^[0-9a-fA-F]{64}$") String tokenHex,
            @NotBlank @Size(max = 2048) @Pattern(regexp = "^[0-9a-fA-F]+$") String signatureHex,
            @NotNull @NotEmpty @Size(max = 50) List<@NotNull Integer> selections,
            @NotBlank @Pattern(regexp = "^[0-9a-fA-F]{32,64}$") String submissionNonce) {
    }

    public record ConfirmRequest(@NotBlank @Size(max = 400) String qrPayload) {
    }

    /** result: VALID, DUPLICATE, INVALID or EXPIRED (the request itself was well formed). */
    public record ConfirmResult(String result, String detail, Long electionId, String receiptCode) {
    }

    public record ReissueRequest(
            @NotBlank @Pattern(regexp = "^[0-9a-fA-F]{64}$") String tokenHex,
            @NotBlank @Size(max = 2048) @Pattern(regexp = "^[0-9a-fA-F]+$") String signatureHex) {
    }

    /** Receipt: no identity, token, credential or selection — only what is needed to look the ballot up. */
    /**
     * @param bulletinSeq null until the ballot's shuffled batch is published (status ACCEPTED_PENDING_PUBLICATION)
     */
    public record ReceiptView(Long electionId, String electionTitle, String receiptCode, String ballotCommitment,
                              Integer bulletinSeq, String status, String verifyUrl, String qrPngDataUri,
                              boolean replayed, boolean confirmationRequired, String qrPayload, long issuedAtMillis,
                              int confirmWindowSeconds) {
    }
}
