package com.digivote.voting;

import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.audit.SecurityEvent;
import com.digivote.common.ApiException;
import com.digivote.common.Hashing;
import com.digivote.config.DigiVoteProperties;
import com.digivote.crypto.BlindRsa;
import com.digivote.crypto.Paillier;
import com.digivote.crypto.SecureTokens;
import com.digivote.election.Election;
import com.digivote.election.ElectionRepository;
import com.digivote.election.ElectionRule;
import com.digivote.election.ElectionRuleRepository;
import com.digivote.election.rules.RuleEngine;
import com.digivote.election.state.ElectionStateMachine;
import com.digivote.result.ResultService;
import com.digivote.verification.BulletinBoardService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Ballot service (anonymous side). One database transaction performs: credential verification,
 * duplicate check under a per-election lock, selection validation, Paillier encryption, ballot +
 * per-option votes, spent-token record and receipt; when enough ballots are waiting, a shuffled batch is
 * appended to the bulletin board. Either all of
 * it commits or none of it does. The request carries no identity: it is authorized solely by the
 * blind-signed token.
 */
@Service
public class BallotTransaction {

    private final ElectionRepository elections;
    private final ElectionRuleRepository rules;
    private final ElectionKeysRepository keysRepository;
    private final ElectionKeyService keys;
    private final BallotRepository ballots;
    private final VoteRepository votes;
    private final VotingTokenRepository tokens;
    private final VerificationReceiptRepository receipts;
    private final BulletinBoardService bulletin;
    private final BulletinBoardRepository bulletinEntries;
    private final ResultService results;
    private final RuleEngine ruleEngine;
    private final ElectionStateMachine stateMachine;
    private final ReceiptCodes receiptCodes;
    private final AuditService audit;
    private final DigiVoteProperties properties;
    private final Clock clock;
    private final PendingConfirmationRepository pending;
    private final QrReceipts qrReceipts;
    private final boolean qrConfirmation;

    public BallotTransaction(ElectionRepository elections, ElectionRuleRepository rules,
                             ElectionKeysRepository keysRepository, ElectionKeyService keys, BallotRepository ballots,
                             VoteRepository votes, VotingTokenRepository tokens, VerificationReceiptRepository receipts,
                             BulletinBoardService bulletin, BulletinBoardRepository bulletinEntries,
                             ResultService results, RuleEngine ruleEngine,
                             ElectionStateMachine stateMachine, ReceiptCodes receiptCodes, AuditService audit,
                             DigiVoteProperties properties, Clock clock, PendingConfirmationRepository pending,
                             QrReceipts qrReceipts,
                             @org.springframework.beans.factory.annotation.Value("${digivote.qr-confirmation.enabled:false}")
                             boolean qrConfirmation) {
        this.pending = pending;
        this.qrReceipts = qrReceipts;
        this.qrConfirmation = qrConfirmation;
        this.elections = elections;
        this.rules = rules;
        this.keysRepository = keysRepository;
        this.keys = keys;
        this.ballots = ballots;
        this.votes = votes;
        this.tokens = tokens;
        this.receipts = receipts;
        this.bulletin = bulletin;
        this.bulletinEntries = bulletinEntries;
        this.results = results;
        this.ruleEngine = ruleEngine;
        this.stateMachine = stateMachine;
        this.receiptCodes = receiptCodes;
        this.audit = audit;
        this.properties = properties;
        this.clock = clock;
    }

    public static String tokenHash(Long electionId, byte[] token) {
        return Hashing.sha256Hex("DIGI-VOTE-TOKEN|" + electionId + "|" + HexFormat.of().formatHex(token));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public VotingDtos.ReceiptView cast(Long electionId, VotingDtos.CastBallotRequest request) {
        Election election = elections.findById(electionId).orElseThrow(() -> ApiException.notFound("Election"));
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        Instant now = clock.instant();
        if (!stateMachine.stateOf(election).acceptsBallots() || !ruleEngine.votingWindowOpen(rule, now)) {
            // An exact retry (same credential, same submission nonce) of a ballot that was accepted before voting
            // closed still returns its receipt, e.g. when the original response was lost in the closing race.
            // Nothing is written; any other submission after close is refused.
            var replayed = replayAfterClose(election, rule, request);
            if (replayed != null) {
                return replayed;
            }
            boolean ended = election.getStatus().ordinal() > com.digivote.election.ElectionStatus.VOTING.ordinal()
                    || ruleEngine.votingWindowEnded(rule, now);
            throw new BallotRejectedException(HttpStatus.CONFLICT, ended ? "CREDENTIAL_EXPIRED" : "VOTING_NOT_OPEN",
                    ended ? "Voting has closed; this credential has expired" : "Voting is not open yet",
                    SecurityEvent.Type.BALLOT_OUTSIDE_WINDOW);
        }

        // Per-election serialization point: duplicate checks and bulletin batches happen under this lock.
        ElectionKeys k = keysRepository.lockForBallot(electionId)
                .orElseThrow(() -> ApiException.conflict("KEYS_MISSING", "Voting has not been opened"));
        // Re-read the status under the lock: voting may have closed (and the final batch been published)
        // while this request waited, in which case the ballot must not be accepted.
        if (elections.currentStatus(electionId).orElseThrow() != com.digivote.election.ElectionStatus.VOTING) {
            throw new BallotRejectedException(HttpStatus.CONFLICT, "CREDENTIAL_EXPIRED",
                    "Voting has closed; this credential has expired", SecurityEvent.Type.BALLOT_OUTSIDE_WINDOW);
        }

        byte[] token = HexFormat.of().parseHex(request.tokenHex());
        BigInteger signature = new BigInteger(request.signatureHex(), 16);
        if (!BlindRsa.verify(keys.rsaPublic(k), token, signature)) {
            throw new BallotRejectedException(HttpStatus.FORBIDDEN, "INVALID_CREDENTIAL",
                    "The voting credential is not valid for this election", SecurityEvent.Type.INVALID_CREDENTIAL);
        }

        String tokenHash = tokenHash(electionId, token);
        String nonceHash = Hashing.sha256Hex(request.submissionNonce().toLowerCase());
        var spent = tokens.findByElectionIdAndTokenHash(electionId, tokenHash);
        if (spent.isPresent()) {
            if (Hashing.constantTimeEquals(spent.get().getSubmissionNonceHash(), nonceHash)) {
                return replay(election, rule, spent.get(), tokenHash);
            }
            throw new BallotRejectedException(HttpStatus.CONFLICT, "DUPLICATE_VOTE",
                    "This credential has already been used to cast a ballot", SecurityEvent.Type.DUPLICATE_BALLOT);
        }

        List<ResultService.BallotOption> options = results.ballotOptions(electionId, rule);
        int candidateCount = (int) options.stream().filter(o -> !o.nota()).count();
        ruleEngine.validateSelection(rule, request.selections(), candidateCount);

        Paillier.PublicKey pub = keys.paillierPublic(k);
        Set<Integer> chosen = new HashSet<>(request.selections());
        List<String> ciphertexts = new ArrayList<>(options.size());
        for (ResultService.BallotOption option : options) {
            BigInteger bit = chosen.contains(option.index()) ? BigInteger.ONE : BigInteger.ZERO;
            ciphertexts.add(Paillier.encrypt(pub, bit, SecureTokens.random()).toString(16));
        }
        String commitment = BallotCommitments.commit(electionId, ciphertexts);

        // Anonymous-side rows get random ids and no timestamps or selection counts (see AnonymousIds, V4 migration).
        Ballot ballot = ballots.save(new Ballot(electionId, commitment));
        for (int i = 0; i < ciphertexts.size(); i++) {
            votes.save(new Vote(ballot.getId(), i, ciphertexts.get(i)));
        }
        tokens.save(new VotingToken(electionId, tokenHash, nonceHash, ballot.getId()));
        String receiptCode = null;
        if (rule.isReceiptsRequired()) {
            receiptCode = receiptCodes.derive(electionId, tokenHash);
            receipts.save(new VerificationReceipt(ballot.getId(), electionId,
                    ReceiptCodes.hash(ReceiptCodes.normalizeAndCheck(receiptCode))));
        }
        // Two-phase mode: the ballot does not count (no bulletin entry, tally or aggregate) until its QR receipt is
        // confirmed within the window. The marker row has no time and no voter.
        boolean confirmationRequired = qrConfirmation && rule.isQrReceipts() && rule.isReceiptsRequired();
        if (confirmationRequired) {
            pending.save(new PendingConfirmation(ballot.getId()));
        }
        // No per-ballot audit event: placed in the organization's audit chain it would sit right after this
        // voter's CREDENTIAL_ISSUED event and pair them. The ballot is published to the bulletin board only as
        // part of a shuffled batch; the batch (not the ballot) is audited.
        int published = bulletin.publishPending(electionId, properties.anonymity().bulletinBatchSize(),
                LocalDateTime.ofInstant(now, ZoneOffset.UTC).truncatedTo(ChronoUnit.MINUTES));
        if (published > 0) {
            audit.recordAnonymous(AuditEventType.BALLOTS_PUBLISHED, election.getOrganizationId(), electionId,
                    Map.of("published", published, "trigger", "batch"));
        }
        Integer seq = bulletinEntries.findByBallotId(ballot.getId()).map(BulletinBoardEntry::getSeq).orElse(null);
        return receiptView(election, rule, receiptCode, commitment, seq, false, confirmationRequired, now.toEpochMilli());
    }

    private VotingDtos.ReceiptView replayAfterClose(Election election, ElectionRule rule,
                                                    VotingDtos.CastBallotRequest request) {
        ElectionKeys k = keysRepository.findById(election.getId()).orElse(null);
        if (k == null) {
            return null;
        }
        byte[] token = HexFormat.of().parseHex(request.tokenHex());
        if (!BlindRsa.verify(keys.rsaPublic(k), token, new BigInteger(request.signatureHex(), 16))) {
            return null;
        }
        String tokenHash = tokenHash(election.getId(), token);
        String nonceHash = Hashing.sha256Hex(request.submissionNonce().toLowerCase());
        return tokens.findByElectionIdAndTokenHash(election.getId(), tokenHash)
                .filter(spent -> Hashing.constantTimeEquals(spent.getSubmissionNonceHash(), nonceHash))
                .map(spent -> replay(election, rule, spent, tokenHash))
                .orElse(null);
    }

    /** Safe retry: same token and same submission nonce return the original receipt; nothing new is stored. */
    private VotingDtos.ReceiptView replay(Election election, ElectionRule rule, VotingToken spent, String tokenHash) {
        Ballot ballot = ballots.findById(spent.getBallotId()).orElseThrow();
        Integer seq = bulletinEntries.findByBallotId(ballot.getId()).map(BulletinBoardEntry::getSeq).orElse(null);
        String code = rule.isReceiptsRequired() ? receiptCodes.derive(election.getId(), tokenHash) : null;
        // The original issue time is not stored (privacy), so a replay carries no fresh QR payload; the device keeps
        // the one it received.
        boolean stillPending = pending.findById(ballot.getId()).filter(p -> !p.isVoided()).isPresent();
        return receiptView(election, rule, code, ballot.getBallotCommitment(), seq, true, stillPending, 0L);
    }

    private VotingDtos.ReceiptView receiptView(Election election, ElectionRule rule, String code, String commitment,
                                               Integer seq, boolean replayed, boolean confirmationRequired,
                                               long issuedAtMillis) {
        // The web app uses hash routing, so the verification page lives at <base>/#/verify
        String verifyUrl = code == null ? null : properties.publicBaseUrl() + "/#/verify?code=" + code;
        String qr = code != null && rule.isQrReceipts() ? QrCodes.pngDataUri(verifyUrl) : null;
        String payload = confirmationRequired && code != null && issuedAtMillis > 0
                ? qrReceipts.payload(election.getId(), code, issuedAtMillis, commitment) : null;
        String status = confirmationRequired ? "AWAITING_QR_CONFIRMATION"
                : seq == null ? "ACCEPTED_PENDING_PUBLICATION" : "BALLOT_RECORDED";
        return new VotingDtos.ReceiptView(election.getId(), election.getTitle(), code, commitment, seq, status,
                verifyUrl, qr, replayed, confirmationRequired, payload, issuedAtMillis,
                (int) (QrReceipts.WINDOW_MILLIS / 1000));
    }
}
