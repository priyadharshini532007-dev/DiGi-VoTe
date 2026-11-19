package com.digivote.verification;

import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.election.Election;
import com.digivote.election.ElectionRepository;
import com.digivote.election.ElectionStatus;
import com.digivote.result.ElectionResult;
import com.digivote.result.ResultService;
import com.digivote.voting.Ballot;
import com.digivote.voting.BallotRepository;
import com.digivote.voting.BulletinBoardEntry;
import com.digivote.voting.BulletinBoardRepository;
import com.digivote.voting.ReceiptCodes;
import com.digivote.voting.VerificationReceipt;
import com.digivote.voting.VerificationReceiptRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Receipt verification. Each outcome states exactly what it proves:
 * <ul>
 *   <li>INVALID_RECEIPT: the code is malformed or fails its check character (typo); nothing was looked up.</li>
 *   <li>RECEIPT_NOT_FOUND: no ballot was accepted with this receipt.</li>
 *   <li>RECEIPT_RECOGNIZED: the ballot was accepted while voting is open and awaits publication in a shuffled
 *       bulletin-board batch (positions are withheld until then so they cannot be matched to voters).</li>
 *   <li>BALLOT_RECORDED: an accepted ballot with this receipt is on the public bulletin board and the board's
 *       hash chain verifies.</li>
 *   <li>INCLUDED_IN_TALLY: additionally, results were generated over a bulletin board whose head hash
 *       covers this entry, so this ballot's ciphertexts were part of the homomorphic aggregate that was
 *       decrypted. This is server-attested aggregation; there is no zero-knowledge proof of correct decryption.</li>
 *   <li>VERIFICATION_UNAVAILABLE: the bulletin board fails its integrity check, or the ballot is still missing
 *       from it after voting closed (integrity alert); no positive claim is made.</li>
 * </ul>
 * No outcome reveals the selection: the receipt is not linked to any plaintext choice.
 */
@Service
public class ReceiptVerificationService {

    private final VerificationReceiptRepository receipts;
    private final com.digivote.voting.PendingConfirmationRepository pendingConfirmations;
    private final BallotRepository ballots;
    private final BulletinBoardRepository entries;
    private final BulletinBoardService bulletin;
    private final ResultService results;
    private final ElectionRepository elections;
    private final AuditService audit;

    public ReceiptVerificationService(VerificationReceiptRepository receipts, BallotRepository ballots,
                                      BulletinBoardRepository entries, BulletinBoardService bulletin,
                                      ResultService results, ElectionRepository elections, AuditService audit, com.digivote.voting.PendingConfirmationRepository pendingConfirmations) {
        this.pendingConfirmations = pendingConfirmations;
        this.receipts = receipts;
        this.ballots = ballots;
        this.entries = entries;
        this.bulletin = bulletin;
        this.results = results;
        this.elections = elections;
        this.audit = audit;
    }

    public enum Outcome { INVALID_RECEIPT, RECEIPT_NOT_FOUND, RECEIPT_RECOGNIZED, BALLOT_RECORDED, INCLUDED_IN_TALLY,
        VERIFICATION_UNAVAILABLE, NOT_CONFIRMED }

    public record Verification(Outcome status, String meaning, Long electionId, String electionTitle,
                               String electionStatus, Integer bulletinSeq, String ballotCommitment, String entryHash,
                               LocalDateTime recordedAtMinute, String resultHash, String bulletinHeadAtTally,
                               List<String> checks) {
    }

    public Verification verify(String code) {
        String compact = ReceiptCodes.normalizeAndCheck(code);
        if (compact == null) {
            return simple(Outcome.INVALID_RECEIPT,
                    "This is not a valid DIGI-VOTE receipt code (wrong length or check character). Check for typos.");
        }
        Optional<VerificationReceipt> receipt = receipts.findByReceiptCodeHash(ReceiptCodes.hash(compact));
        if (receipt.isEmpty()) {
            return simple(Outcome.RECEIPT_NOT_FOUND, "No accepted ballot carries this receipt.");
        }
        VerificationReceipt r = receipt.get();
        Election election = elections.findById(r.getElectionId()).orElseThrow();
        Ballot ballot = ballots.findById(r.getBallotId()).orElseThrow();
        Optional<BulletinBoardEntry> entry = entries.findByBallotId(ballot.getId());
        List<String> checks = new ArrayList<>();
        var unconfirmed = pendingConfirmations.findById(ballot.getId());
        if (unconfirmed.isPresent()) {
            checks.add("Receipt recognized for election \"" + election.getTitle() + "\"");
            checks.add("Ballot accepted but its QR receipt has not been confirmed");
            Verification pendingResult = election.getStatus() == ElectionStatus.VOTING && !unconfirmed.get().isVoided()
                    ? build(Outcome.RECEIPT_RECOGNIZED, "Your ballot was accepted but is not counted until its QR receipt "
                    + "is confirmed within 30 seconds of voting.", election, ballot, null, null, checks)
                    : build(Outcome.NOT_CONFIRMED, "This ballot was never confirmed with its QR receipt, so it was not "
                    + "counted.", election, ballot, null, null, checks);
            audit.recordIndependently(AuditEventType.RECEIPT_VERIFIED, election.getOrganizationId(), election.getId(),
                    null, Map.of("outcome", pendingResult.status().name()));
            return pendingResult;
        }
        checks.add("Receipt recognized for election \"" + election.getTitle() + "\"");
        Verification result;
        if (entry.isEmpty() && election.getStatus() == ElectionStatus.VOTING) {
            checks.add("Ballot accepted; awaiting publication in a shuffled bulletin-board batch");
            result = build(Outcome.RECEIPT_RECOGNIZED, "Your ballot was accepted and stored encrypted. To protect "
                    + "your anonymity it is added to the public bulletin board only in a shuffled batch, at the latest "
                    + "when voting closes. Check again then.", election, ballot, null, null, checks);
        } else if (entry.isEmpty()) {
            checks.add("Ballot is missing from the bulletin board after voting closed");
            result = build(Outcome.VERIFICATION_UNAVAILABLE, "The receipt exists but its ballot is missing from the "
                    + "bulletin board. Report this to the election auditor.", election, ballot, null, null, checks);
        } else {
            BulletinBoardService.ChainCheck chain = bulletin.verify(election.getId());
            if (!chain.valid()) {
                checks.add("Bulletin board hash chain FAILED verification");
                result = build(Outcome.VERIFICATION_UNAVAILABLE, "The bulletin board failed its integrity check, "
                        + "so inclusion cannot be confirmed.", election, ballot, entry.get(), null, checks);
            } else {
                checks.add("Ballot found on the bulletin board at position " + entry.get().getSeq());
                checks.add("Bulletin board hash chain verified (" + chain.entries() + " entries)");
                Optional<ElectionResult> res = results.find(election.getId());
                boolean included = res.isPresent() && entry.get().getSeq() <= res.get().getAcceptedBallots()
                        && res.get().getBulletinHeadHash().equals(chain.headHash());
                if (included) {
                    checks.add("Results were computed over the bulletin board head " + shortHash(chain.headHash())
                            + ", which includes this ballot");
                    result = build(Outcome.INCLUDED_IN_TALLY, "Your ballot is recorded and was part of the "
                            + "encrypted tally used to compute the results.", election, ballot, entry.get(),
                            res.get(), checks);
                } else {
                    result = build(Outcome.BALLOT_RECORDED, "Your ballot is recorded on the public bulletin board. "
                            + "Tally inclusion can be confirmed after results are generated.", election, ballot,
                            entry.get(), null, checks);
                }
            }
        }
        audit.recordIndependently(AuditEventType.RECEIPT_VERIFIED, election.getOrganizationId(), election.getId(),
                null, Map.of("outcome", result.status().name()));
        return result;
    }

    private static String shortHash(String h) {
        return h.substring(0, 12) + "…";
    }

    private Verification simple(Outcome outcome, String meaning) {
        return new Verification(outcome, meaning, null, null, null, null, null, null, null, null, null, List.of());
    }

    private Verification build(Outcome outcome, String meaning, Election election, Ballot ballot,
                               BulletinBoardEntry entry, ElectionResult result, List<String> checks) {
        return new Verification(outcome, meaning, election.getId(), election.getTitle(), election.getStatus().name(),
                entry == null ? null : entry.getSeq(), ballot.getBallotCommitment(),
                entry == null ? null : entry.getEntryHash(), ballot.getAcceptedAtMinute(),
                result == null ? null : result.getResultHash(), result == null ? null : result.getBulletinHeadHash(),
                List.copyOf(checks));
    }
}
