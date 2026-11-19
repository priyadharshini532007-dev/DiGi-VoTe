package com.digivote.voting;

import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.audit.SecurityEvent;
import com.digivote.audit.SecurityEventService;
import com.digivote.config.DigiVoteProperties;
import com.digivote.election.Election;
import com.digivote.election.ElectionRepository;
import com.digivote.election.ElectionStatus;
import com.digivote.verification.BulletinBoardService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;

/**
 * Confirms a pending ballot from its signed QR receipt. The request carries no identity (it is authorized by the
 * server's own signature over the receipt content) and the server stores nothing about who submitted it. A confirmed
 * ballot leaves the pending state and is published to the bulletin board in the normal shuffled batches.
 */
@Service
public class BallotConfirmationService {

    private final QrReceipts qrReceipts;
    private final VerificationReceiptRepository receipts;
    private final BallotRepository ballots;
    private final PendingConfirmationRepository pending;
    private final ElectionRepository elections;
    private final ElectionKeysRepository keysRepository;
    private final BulletinBoardService bulletin;
    private final SecurityEventService securityEvents;
    private final AuditService audit;
    private final DigiVoteProperties properties;
    private final Clock clock;

    public BallotConfirmationService(QrReceipts qrReceipts, VerificationReceiptRepository receipts,
                                     BallotRepository ballots, PendingConfirmationRepository pending,
                                     ElectionRepository elections, ElectionKeysRepository keysRepository,
                                     BulletinBoardService bulletin, SecurityEventService securityEvents,
                                     AuditService audit, DigiVoteProperties properties, Clock clock) {
        this.qrReceipts = qrReceipts;
        this.receipts = receipts;
        this.ballots = ballots;
        this.pending = pending;
        this.elections = elections;
        this.keysRepository = keysRepository;
        this.bulletin = bulletin;
        this.securityEvents = securityEvents;
        this.audit = audit;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public VotingDtos.ConfirmResult confirm(String text) {
        QrReceipts.Parsed qr = qrReceipts.parseAndVerify(text);
        if (qr == null) {
            securityEvents.record(null, SecurityEvent.Type.INVALID_QR, SecurityEvent.Severity.MEDIUM, null,
                    "A QR receipt with an unreadable format or a bad signature was submitted");
            return result("INVALID", "Not a DigiVote receipt QR (unreadable, or its content was altered)", null, null);
        }
        Long electionId = qr.electionId();
        Optional<Election> election = elections.findById(electionId);
        String compact = ReceiptCodes.normalizeAndCheck(qr.receiptCode());
        if (election.isEmpty() || compact == null) {
            return result("INVALID", "No receipt with this code was issued", electionId, qr.receiptCode());
        }
        // Same serialization point as ballot acceptance and bulletin batches.
        keysRepository.lockForBallot(electionId).orElse(null);
        if (elections.currentStatus(electionId).orElse(null) != ElectionStatus.VOTING) {
            return result("EXPIRED", "Voting is no longer open, so this ballot can no longer be confirmed", electionId, qr.receiptCode());
        }
        var receipt = receipts.findByReceiptCodeHash(ReceiptCodes.hash(compact))
                .filter(r -> r.getElectionId().equals(electionId));
        var ballot = receipt.flatMap(r -> ballots.findById(r.getBallotId()))
                .filter(b -> b.getBallotCommitment().equals(qr.commitment()));
        if (ballot.isEmpty()) {
            return result("INVALID", "No receipt with this code was issued", electionId, qr.receiptCode());
        }
        Optional<PendingConfirmation> marker = pending.findById(ballot.get().getId());
        if (marker.isEmpty()) {
            securityEvents.record(election.get().getOrganizationId(), SecurityEvent.Type.DUPLICATE_QR,
                    SecurityEvent.Severity.LOW, null, "A QR receipt that was already validated was submitted again");
            return result("DUPLICATE", "This QR was already submitted and validated", electionId, qr.receiptCode());
        }
        if (marker.get().isVoided()) {
            return result("INVALID", "This receipt was voided; the vote must be cast again", electionId, qr.receiptCode());
        }
        Instant now = clock.instant();
        long age = now.toEpochMilli() - qr.issuedAtMillis();
        if (age < -5_000) {
            return result("INVALID", "The receipt time is in the future", electionId, qr.receiptCode());
        }
        if (age > QrReceipts.WINDOW_MILLIS) {
            return result("EXPIRED", "Submitted " + Math.round(age / 1000.0) + " s after issue (limit "
                    + QrReceipts.WINDOW_MILLIS / 1000 + " s)", electionId, qr.receiptCode());
        }
        pending.delete(marker.get());
        int published = bulletin.publishPending(electionId, properties.anonymity().bulletinBatchSize(),
                LocalDateTime.ofInstant(now, ZoneOffset.UTC).truncatedTo(ChronoUnit.MINUTES));
        if (published > 0) {
            audit.recordAnonymous(AuditEventType.BALLOTS_PUBLISHED, election.get().getOrganizationId(), electionId,
                    Map.of("published", published, "trigger", "batch"));
        }
        return result("VALID", "Validated " + String.format(java.util.Locale.ROOT, "%.1f", Math.max(0, age) / 1000.0)
                + " s after issue; the ballot is committed", electionId, qr.receiptCode());
    }

    private static VotingDtos.ConfirmResult result(String result, String detail, Long electionId, String code) {
        return new VotingDtos.ConfirmResult(result, detail, electionId, code);
    }
}
