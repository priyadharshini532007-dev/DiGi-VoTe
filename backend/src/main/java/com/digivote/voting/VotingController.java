package com.digivote.voting;

import com.digivote.access.AccessControlService;
import com.digivote.candidate.Candidate;
import com.digivote.candidate.CandidateRepository;
import com.digivote.common.ApiException;
import com.digivote.common.PageResponse;
import com.digivote.election.ElectionRule;
import com.digivote.election.ElectionRuleRepository;
import com.digivote.election.state.ElectionStateMachine;
import com.digivote.result.ResultService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/elections/{electionId}")
@Tag(name = "Eligible voters, credentials and ballots")
public class VotingController {

    private final EligibilityService eligibility;
    private final CredentialIssuanceService credentials;
    private final ResultService results;
    private final ElectionRuleRepository rules;
    private final CandidateRepository candidates;
    private final ElectionStateMachine stateMachine;
    private final AccessControlService access;
    private final CredentialReissueService reissues;

    public VotingController(EligibilityService eligibility, CredentialIssuanceService credentials,
                            ResultService results, ElectionRuleRepository rules, CandidateRepository candidates,
                            ElectionStateMachine stateMachine, AccessControlService access, CredentialReissueService reissues) {
        this.reissues = reissues;
        this.eligibility = eligibility;
        this.credentials = credentials;
        this.results = results;
        this.rules = rules;
        this.candidates = candidates;
        this.stateMachine = stateMachine;
        this.access = access;
    }

    @GetMapping("/voters")
    public PageResponse<VotingDtos.EligibleVoterView> voters(@PathVariable Long electionId,
                                                             @RequestParam(defaultValue = "0") int page,
                                                             @RequestParam(defaultValue = "50") int size) {
        return eligibility.list(electionId, page, size);
    }

    @PostMapping("/voters")
    @Operation(summary = "Add organization members to the eligible voter list by email")
    public VotingDtos.AddVotersResult addVoters(@PathVariable Long electionId,
                                                @Valid @RequestBody VotingDtos.AddVotersRequest request) {
        return eligibility.addVoters(electionId, request.emails());
    }

    @PostMapping("/voters/add-all-members")
    @Operation(summary = "Add every active Voter and Candidate member to the voter list")
    public VotingDtos.AddVotersResult addAll(@PathVariable Long electionId) {
        return eligibility.addAllMembers(electionId);
    }

    @DeleteMapping("/voters/{eligibleVoterId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeVoter(@PathVariable Long electionId, @PathVariable Long eligibleVoterId) {
        eligibility.removeVoter(electionId, eligibleVoterId);
    }

    @GetMapping("/eligibility")
    @Operation(summary = "Whether the current user may vote, with reasons")
    public VotingDtos.EligibilityView myEligibility(@PathVariable Long electionId) {
        return eligibility.myEligibility(electionId);
    }

    @GetMapping("/credential-key")
    @Operation(summary = "RSA public key used to blind and verify voting credentials")
    public VotingDtos.CredentialKeyView key(@PathVariable Long electionId) {
        return credentials.publicKey(electionId);
    }

    @PostMapping("/credentials")
    @Operation(summary = "Obtain a blind signature on a blinded voting token (one per eligible voter)")
    public VotingDtos.CredentialResponse issue(@PathVariable Long electionId,
                                               @Valid @RequestBody VotingDtos.CredentialRequest request) {
        return credentials.issue(electionId, request.blindedMessageHex());
    }

    @PostMapping("/credentials/reissue")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Get a fresh credential after a ballot that was never QR-confirmed (voids that ballot)")
    public void reissue(@PathVariable Long electionId, @Valid @RequestBody VotingDtos.ReissueRequest request) {
        reissues.reissue(electionId, request);
    }

    @GetMapping("/ballot")
    @Operation(summary = "Ballot options in ballot order (while voting is open)")
    public VotingDtos.BallotView ballot(@PathVariable Long electionId) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        if (!stateMachine.stateOf(a.election()).acceptsBallots()) {
            throw ApiException.conflict("VOTING_NOT_OPEN", "Voting is not open for this election");
        }
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        Map<Long, Candidate> byId = candidates.findByElectionIdOrderByBallotPositionAsc(electionId).stream()
                .collect(Collectors.toMap(Candidate::getId, c -> c));
        List<VotingDtos.BallotOptionView> options = results.ballotOptions(electionId, rule).stream()
                .map(o -> {
                    Candidate c = o.candidateId() == null ? null : byId.get(o.candidateId());
                    String photo = c == null || c.getPhotoMediaId() == null ? null : "/api/media/" + c.getPhotoMediaId();
                    return new VotingDtos.BallotOptionView(o.index(), o.candidateId(), o.label(), o.nota(), photo);
                }).toList();
        return new VotingDtos.BallotView(electionId, a.election().getTitle(), rule.getMaxSelections(),
                rule.isNotaEnabled(), rule.getVotingEnd(), options);
    }
}
