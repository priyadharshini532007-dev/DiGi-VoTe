package com.digivote.verification;

import com.digivote.common.ApiException;
import com.digivote.common.PageResponse;
import com.digivote.election.Election;
import com.digivote.election.ElectionRepository;
import com.digivote.election.ElectionRule;
import com.digivote.election.ElectionRuleRepository;
import com.digivote.election.ElectionStatus;
import com.digivote.organization.OrganizationRepository;
import com.digivote.result.ResultDtos;
import com.digivote.result.ResultService;
import com.digivote.voting.BallotSubmissionService;
import com.digivote.voting.CredentialIssuanceService;
import com.digivote.voting.BulletinBoardEntry;
import com.digivote.voting.BulletinBoardRepository;
import com.digivote.voting.VotingDtos;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

/**
 * Unauthenticated endpoints. Only elections whose rules make results public, and that have reached
 * VOTING or later, are listed here; nothing identifies a voter.
 */
@RestController
@RequestMapping("/api/public")
@Tag(name = "Public: elections, results, bulletin board, receipts, ballot submission")
public class PublicController {

    private static final EnumSet<ElectionStatus> PUBLIC_STATES = EnumSet.of(ElectionStatus.VOTING,
            ElectionStatus.VERIFICATION, ElectionStatus.PUBLISHED, ElectionStatus.ARCHIVED);

    private final ElectionRepository elections;
    private final ElectionRuleRepository rules;
    private final OrganizationRepository organizations;
    private final ResultService results;
    private final com.digivote.voting.BallotConfirmationService confirmations;
    private final com.digivote.voting.EligibleVoterRepository eligibleVoters;
    private final BulletinBoardRepository bulletinEntries;
    private final BulletinBoardService bulletin;
    private final ReceiptVerificationService receipts;
    private final BallotSubmissionService ballots;
    private final CredentialIssuanceService credentials;

    public PublicController(ElectionRepository elections, ElectionRuleRepository rules,
                            OrganizationRepository organizations, ResultService results,
                            BulletinBoardRepository bulletinEntries, BulletinBoardService bulletin,
                            ReceiptVerificationService receipts, BallotSubmissionService ballots,
                            CredentialIssuanceService credentials, com.digivote.voting.BallotConfirmationService confirmations, com.digivote.voting.EligibleVoterRepository eligibleVoters) {
        this.eligibleVoters = eligibleVoters;
        this.confirmations = confirmations;
        this.elections = elections;
        this.rules = rules;
        this.organizations = organizations;
        this.results = results;
        this.bulletinEntries = bulletinEntries;
        this.bulletin = bulletin;
        this.receipts = receipts;
        this.ballots = ballots;
        this.credentials = credentials;
    }

    public record PublicElection(Long id, String title, String organizationName, ElectionStatus status,
                                 Instant votingStart, Instant votingEnd, boolean resultsPublished,
                                 String credentialKeyFingerprint, String description, long eligibleVoters,
                                 String countingMethod) {
    }

    public record BulletinEntryView(int seq, String ballotCommitment, String prevHash, String entryHash,
                                    LocalDateTime postedAtMinute) {
    }

    public record BulletinPage(Long electionId, String electionTitle, PageResponse<BulletinEntryView> entries,
                               BulletinBoardService.ChainCheck chain) {
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP", "application", "DIGI-VOTE");
    }

    @GetMapping("/elections")
    @Transactional(readOnly = true)
    @Operation(summary = "Elections with public results that are in or past voting")
    public List<PublicElection> elections() {
        return elections.findByStatusIn(PUBLIC_STATES).stream()
                .map(e -> Map.entry(e, rules.findById(e.getId()).orElseThrow()))
                .filter(p -> p.getValue().isPublicResults())
                .map(p -> new PublicElection(p.getKey().getId(), p.getKey().getTitle(),
                        organizations.findById(p.getKey().getOrganizationId()).map(o -> o.getName()).orElse(""),
                        p.getKey().getStatus(), p.getValue().getVotingStart(), p.getValue().getVotingEnd(),
                        results.isPublished(p.getKey().getId()), fingerprintOrNull(p.getKey().getId()),
                        p.getKey().getDescription(),
                        eligibleVoters.countByElectionIdAndStatus(p.getKey().getId(), com.digivote.voting.EligibleVoter.Status.ELIGIBLE),
                        p.getValue().getCountingMethod().name()))
                .toList();
    }

    @GetMapping("/elections/{electionId}/results")
    public ResultDtos.ResultView results(@PathVariable Long electionId) {
        return results.forPublic(electionId);
    }

    @GetMapping("/elections/{electionId}/bulletin")
    @Transactional(readOnly = true)
    @Operation(summary = "Public bulletin board: hash-chained ballot commitments")
    public BulletinPage bulletin(@PathVariable Long electionId, @RequestParam(defaultValue = "0") int page,
                                 @RequestParam(defaultValue = "50") int size) {
        Election election = publicElection(electionId);
        var result = bulletinEntries.findByElectionId(electionId, PageResponse.pageable(page, size, Sort.by("seq")));
        return new BulletinPage(electionId, election.getTitle(), PageResponse.of(result, PublicController::view),
                bulletin.verify(electionId));
    }

    @GetMapping("/elections/{electionId}/credential-key")
    @Operation(summary = "Election-wide credential-signing public key and its canonical fingerprint (key transparency)")
    public VotingDtos.CredentialKeyView credentialKey(@PathVariable Long electionId) {
        return credentials.publicAnchor(electionId);
    }

    @GetMapping("/receipts/{code}")
    @Operation(summary = "Verify a ballot receipt code")
    public ReceiptVerificationService.Verification verifyReceipt(@PathVariable String code) {
        return receipts.verify(code);
    }

    @PostMapping("/ballots/confirm")
    @Operation(summary = "Confirm a pending ballot with its signed QR receipt (no login, no identity)")
    public VotingDtos.ConfirmResult confirmBallot(@Valid @RequestBody VotingDtos.ConfirmRequest request,
                                                  HttpServletRequest http) {
        if (http.getHeader("Authorization") != null) {
            throw ApiException.badRequest("IDENTITY_NOT_ALLOWED",
                    "Receipts must be confirmed without an Authorization header to preserve anonymity");
        }
        return confirmations.confirm(request.qrPayload());
    }

    @PostMapping("/elections/{electionId}/ballots")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Cast a ballot with an anonymous blind-signed credential (no login, no identity)")
    public VotingDtos.ReceiptView castBallot(@PathVariable Long electionId,
                                             @Valid @RequestBody VotingDtos.CastBallotRequest request,
                                             HttpServletRequest http) {
        if (http.getHeader("Authorization") != null) {
            throw ApiException.badRequest("IDENTITY_NOT_ALLOWED",
                    "Ballots must be submitted without an Authorization header to preserve anonymity");
        }
        return ballots.submit(electionId, request);
    }

    private String fingerprintOrNull(Long electionId) {
        try {
            return credentials.publicAnchor(electionId).fingerprint();
        } catch (ApiException e) {
            return null;
        }
    }

    static BulletinEntryView view(BulletinBoardEntry e) {
        return new BulletinEntryView(e.getSeq(), e.getBallotCommitment(), e.getPrevHash(), e.getEntryHash(),
                e.getPostedAtMinute());
    }

    private Election publicElection(Long electionId) {
        Election election = elections.findById(electionId).orElseThrow(() -> ApiException.notFound("Election"));
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        if (!PUBLIC_STATES.contains(election.getStatus()) || !rule.isPublicResults()) {
            throw ApiException.notFound("Election");
        }
        return election;
    }
}
