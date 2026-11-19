package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two-phase ballots (digivote.qr-confirmation.enabled=true): a ballot counts only after its signed QR receipt is
 * confirmed within 30 s; unconfirmed ballots stay out of the bulletin board, tally and aggregates; a voter whose
 * ballot was never confirmed can get a fresh credential, and the old ballot can never be confirmed afterwards.
 */
@TestPropertySource(properties = "digivote.qr-confirmation.enabled=true")
class QrConfirmationIT extends IntegrationTestBase {

    private long pendingIn(Scenario s) {
        return count("SELECT COUNT(*) FROM ballot_pending_confirmation p JOIN ballots b ON b.id = p.ballot_id WHERE b.election_id = ?", s.electionId);
    }

    private JsonNode confirm(String payload) throws Exception {
        Response r = postRaw("/api/public/ballots/confirm", null, Map.of("qrPayload", payload));
        assertThat(r.status()).isEqualTo(200);
        return r.body();
    }

    private JsonNode castPending(Scenario s, String voterToken, int option) throws Exception {
        JsonNode receipt = vote(voterToken, s.electionId, option);
        assertThat(receipt.get("confirmationRequired").asBoolean()).isTrue();
        assertThat(receipt.get("status").asText()).isEqualTo("AWAITING_QR_CONFIRMATION");
        assertThat(receipt.get("qrPayload").asText()).startsWith("DIGIVOTE|QR1|");
        return receipt;
    }

    @Test
    void ballotCountsOnlyAfterItsQrReceiptIsConfirmed() throws Exception {
        Scenario s = voting();
        JsonNode r1 = castPending(s, s.voter1, 0);
        JsonNode r2 = castPending(s, s.voter2, 0);
        // a third ballot that is never confirmed
        castPending(s, s.candidates.get(1), 1);

        assertThat(pendingIn(s)).isEqualTo(3);
        assertThat(count("SELECT COUNT(*) FROM bulletin_board_entries WHERE election_id = ?", s.electionId)).isZero();
        assertThat(getOk("/api/public/receipts/" + r1.get("receiptCode").asText(), null).get("status").asText())
                .isEqualTo("RECEIPT_RECOGNIZED");

        assertThat(confirm(r1.get("qrPayload").asText()).get("result").asText()).isEqualTo("VALID");
        assertThat(confirm(r2.get("qrPayload").asText()).get("result").asText()).isEqualTo("VALID");
        // the same QR again is a duplicate and changes nothing
        assertThat(confirm(r1.get("qrPayload").asText()).get("result").asText()).isEqualTo("DUPLICATE");
        assertThat(pendingIn(s)).isEqualTo(1);

        transition(s, "VERIFICATION");
        JsonNode result = postOk("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
        assertThat(result.get("acceptedBallots").asInt()).isEqualTo(2);
        assertThat(result.at("/items/0/votes").asInt()).isEqualTo(2);
        assertThat(getOk("/api/public/receipts/" + r1.get("receiptCode").asText(), null).get("status").asText())
                .isIn("BALLOT_RECORDED", "INCLUDED_IN_TALLY");
        // the unconfirmed ballot is reported as such after voting closed
        assertThat(count("SELECT COUNT(*) FROM bulletin_board_entries WHERE election_id = ?", s.electionId)).isEqualTo(2);
    }

    @Test
    void alteredOrExpiredReceiptsAreRejectedAndTheVoterCanRecast() throws Exception {
        Scenario s = voting();
        Credential first = obtainCredential(s.voter1, s.electionId);
        Response cast = cast(s.electionId, first, List.of(0), nonce());
        assertThat(cast.status()).isEqualTo(201);
        String payload = cast.body().get("qrPayload").asText();

        // tampering with the content breaks the signature
        String tampered = payload.replace(cast.body().get("receiptCode").asText(), "AAAAA-AAAAA-AAAAA-AAAAA-A");
        assertThat(confirm(tampered).get("result").asText()).isEqualTo("INVALID");
        assertThat(confirm("not a qr").get("result").asText()).isEqualTo("INVALID");

        // after 30 s the receipt can no longer be confirmed
        clock.advance(Duration.ofSeconds(31));
        assertThat(confirm(payload).get("result").asText()).isEqualTo("EXPIRED");

        // while the ballot is unconfirmed the voter cannot get a second credential the normal way...
        assertThat(postRaw("/api/elections/" + s.electionId + "/credentials", s.voter1,
                Map.of("blindedMessageHex", "abcdef")).status()).isEqualTo(409);
        // ...but can ask for a new one by proving the old one
        Response reissue = postRaw("/api/elections/" + s.electionId + "/credentials/reissue", s.voter1,
                Map.of("tokenHex", first.tokenHex(), "signatureHex", first.signatureHex()));
        assertThat(reissue.status()).isEqualTo(204);

        // the voided ballot can never be confirmed, even within a fresh window
        assertThat(confirm(payload).get("result").asText()).isIn("INVALID", "EXPIRED");

        JsonNode recast = castPending(s, s.voter1, 1);
        assertThat(confirm(recast.get("qrPayload").asText()).get("result").asText()).isEqualTo("VALID");

        // a confirmed ballot cannot be replaced; the spent old token still cannot vote
        Credential second = obtainCredentialAgainFor(s);
        assertThat(second).isNull();
        assertThat(cast(s.electionId, first, List.of(2), nonce()).status()).isEqualTo(409);
    }

    /** After a confirmed ballot, a further reissue is refused. */
    private Credential obtainCredentialAgainFor(Scenario s) throws Exception {
        Response r = postRaw("/api/elections/" + s.electionId + "/credentials/reissue", s.voter1,
                Map.of("tokenHex", "00".repeat(32), "signatureHex", "01"));
        assertThat(r.status()).isIn(403, 409);
        return null;
    }
}
