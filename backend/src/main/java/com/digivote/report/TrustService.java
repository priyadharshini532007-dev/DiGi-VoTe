package com.digivote.report;

import com.digivote.audit.AuditIntegrityService;
import com.digivote.audit.AuditService;
import com.digivote.election.Election;
import com.digivote.election.ElectionStatus;
import com.digivote.result.ElectionResult;
import com.digivote.result.ResultDtos;
import com.digivote.result.ResultService;
import com.digivote.verification.BulletinBoardService;
import com.digivote.voting.BallotRepository;
import com.digivote.voting.VerificationReceiptRepository;
import com.digivote.voting.VotingCredentialRepository;
import com.digivote.voting.VotingTokenRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Election Trust Dashboard / election health. Every check is computed live from persisted data when
 * requested; a check that cannot be run yet is reported as NOT_RUN rather than as a pass.
 */
@Service
public class TrustService {

    public enum CheckStatus { PASS, FAIL, WARN, NOT_RUN }

    public record TrustCheck(String key, String label, CheckStatus status, String detail) {
    }

    public record TrustReport(Long electionId, String title, ElectionStatus status, long acceptedBallots,
                              long credentialsIssued, long spentTokens, long receipts, long duplicateRejections,
                              long receiptVerifications, List<TrustCheck> checks, List<String> warnings,
                              String overall) {
    }

    private final BallotRepository ballots;
    private final VotingTokenRepository tokens;
    private final VotingCredentialRepository credentials;
    private final VerificationReceiptRepository receipts;
    private final BulletinBoardService bulletin;
    private final ResultService results;
    private final AuditIntegrityService auditIntegrity;
    private final JdbcTemplate jdbc;

    public TrustService(BallotRepository ballots, VotingTokenRepository tokens, VotingCredentialRepository credentials,
                        VerificationReceiptRepository receipts, BulletinBoardService bulletin, ResultService results,
                        AuditIntegrityService auditIntegrity, JdbcTemplate jdbc) {
        this.ballots = ballots;
        this.tokens = tokens;
        this.credentials = credentials;
        this.receipts = receipts;
        this.bulletin = bulletin;
        this.results = results;
        this.auditIntegrity = auditIntegrity;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public TrustReport evaluate(Election election) {
        Long id = election.getId();
        long all = ballots.countByElectionId(id);
        long accepted = ballots.countConfirmed(id); // ballots that count; unconfirmed ones are excluded everywhere
        long spent = tokens.countByElectionId(id);
        long issued = credentials.countByElectionId(id);
        long receiptCount = receipts.countByElectionId(id);
        long duplicates = countAudit(id, "BALLOT_REJECTED", "DUPLICATE_VOTE");
        long verifications = countAudit(id, "RECEIPT_VERIFIED", null);
        boolean votingStarted = election.getStatus().ordinal() >= ElectionStatus.VOTING.ordinal();

        List<TrustCheck> checks = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        if (!votingStarted) {
            checks.add(new TrustCheck("ballots", "Ballot accounting", CheckStatus.NOT_RUN, "Voting has not opened"));
        } else {
            boolean ok = spent == all && all <= issued;
            checks.add(new TrustCheck("ballots", "Every accepted ballot spent exactly one unique credential",
                    ok ? CheckStatus.PASS : CheckStatus.FAIL,
                    all + " ballots, " + spent + " spent tokens, " + issued + " credentials issued"
                            + (all != accepted ? ", " + (all - accepted) + " unconfirmed" : "")));
        }

        checks.add(new TrustCheck("duplicates", "Duplicate submissions rejected",
                duplicates > 0 ? CheckStatus.PASS : (votingStarted ? CheckStatus.NOT_RUN : CheckStatus.NOT_RUN),
                duplicates > 0 ? duplicates + " duplicate attempt(s) rejected; database uniqueness on spent tokens holds"
                        : "No duplicate attempts recorded; uniqueness is enforced by UNIQUE(election_id, token_hash)"));

        BulletinBoardService.ChainCheck chain = bulletin.verify(id);
        long pending = ballots.countUnpublished(id);
        boolean votingOpen = election.getStatus() == ElectionStatus.VOTING;
        // While voting is open, ballots wait for a shuffled batch; afterwards every ballot must be on the board.
        boolean accounted = votingOpen ? chain.entries() + pending == accepted : chain.entries() == accepted && pending == 0;
        checks.add(new TrustCheck("bulletin", "Bulletin board hash chain",
                !votingStarted ? CheckStatus.NOT_RUN : chain.valid() && accounted ? CheckStatus.PASS : CheckStatus.FAIL,
                chain.entries() + " entries published" + (pending > 0 ? ", " + pending + " awaiting a shuffled batch" : "")
                        + "; head " + chain.headHash().substring(0, 16) + "…"
                        + (chain.problems().isEmpty() ? "" : "; " + chain.problems().get(0))));

        checks.add(new TrustCheck("receipts", "Receipt verification",
                verifications > 0 ? CheckStatus.PASS : CheckStatus.NOT_RUN,
                receiptCount + " receipts issued; " + verifications + " verification lookup(s) performed"));

        Optional<ElectionResult> result = results.find(id);
        if (result.isEmpty()) {
            checks.add(new TrustCheck("results", "Result consistency", CheckStatus.NOT_RUN, "Results not generated"));
        } else {
            ResultDtos.AggregationCheck agg = results.verifyAggregation(id);
            boolean headMatches = result.get().getBulletinHeadHash().equals(chain.headHash());
            boolean ok = agg.valid() && headMatches && result.get().getAcceptedBallots() == accepted;
            checks.add(new TrustCheck("results", "Results match the accepted ballot set",
                    ok ? CheckStatus.PASS : CheckStatus.FAIL,
                    "Recomputed " + agg.ballotsChecked() + " ballot commitments and " + agg.optionsChecked()
                            + " option aggregates; bulletin head " + (headMatches ? "matches" : "DOES NOT match")
                            + " the tallied head"));
            if (result.get().isTieDetected()) {
                warnings.add("A tie for first place was detected; no winner is declared automatically.");
            }
            if (result.get().getStatus() != ElectionResult.Status.PUBLISHED) {
                warnings.add("Results are generated but not yet published.");
            }
        }

        AuditIntegrityService.ChainVerification audit = auditIntegrity.verify(AuditService.chainKey(election.getOrganizationId()));
        checks.add(new TrustCheck("audit", "Audit log hash chain", audit.valid() ? CheckStatus.PASS : CheckStatus.FAIL,
                audit.recordsChecked() + " records verified"
                        + (audit.problems().isEmpty() ? "" : "; " + audit.problems().get(0))));

        if (verifications == 0 && votingStarted) {
            warnings.add("No voter has verified a receipt yet.");
        }
        warnings.add("Tally decryption is performed by the server; there is no zero-knowledge proof of correct "
                + "decryption, so auditors verify aggregation, not decryption.");
        warnings.add("Ballot encryption happens on the server after validation; the server sees each selection "
                + "transiently in memory (never linked to an identity, never stored in plaintext).");

        boolean anyFail = checks.stream().anyMatch(c -> c.status() == CheckStatus.FAIL);
        boolean allPass = checks.stream().allMatch(c -> c.status() == CheckStatus.PASS);
        String overall = anyFail ? "INTEGRITY_PROBLEMS" : allPass ? "ALL_CHECKS_PASSED" : "CHECKS_INCOMPLETE";
        return new TrustReport(id, election.getTitle(), election.getStatus(), accepted, issued, spent, receiptCount,
                duplicates, verifications, List.copyOf(checks), List.copyOf(warnings), overall);
    }

    private long countAudit(Long electionId, String type, String reason) {
        String sql = "SELECT COUNT(*) FROM audit_logs WHERE election_id = ? AND event_type = ?"
                + (reason == null ? "" : " AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.reason')) = ?");
        Long n = reason == null ? jdbc.queryForObject(sql, Long.class, electionId, type)
                : jdbc.queryForObject(sql, Long.class, electionId, type, reason);
        return n == null ? 0 : n;
    }
}
