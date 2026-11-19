package com.digivote.voting;

import com.digivote.access.AccessControlService;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.common.ApiException;
import com.digivote.common.Hashing;
import com.digivote.crypto.BlindRsa;
import com.digivote.election.Election;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.util.HexFormat;
import java.util.Map;

/**
 * Lets a voter whose ballot was never QR-confirmed obtain a fresh credential. The voter proves the old credential
 * (token + signature); if its ballot is still pending the ballot is voided (it can never be confirmed or counted) and
 * the voter's credential generation moves on. The spent token stays spent forever. Nothing links the voter to the
 * voided ballot afterwards: the marker row carries no voter and no time.
 */
@Service
public class CredentialReissueService {

    private final AccessControlService access;
    private final EligibleVoterRepository voters;
    private final ElectionKeysRepository keysRepository;
    private final ElectionKeyService keys;
    private final VotingTokenRepository tokens;
    private final PendingConfirmationRepository pending;
    private final AuditService audit;

    public CredentialReissueService(AccessControlService access, EligibleVoterRepository voters,
                                    ElectionKeysRepository keysRepository, ElectionKeyService keys,
                                    VotingTokenRepository tokens, PendingConfirmationRepository pending,
                                    AuditService audit) {
        this.access = access;
        this.voters = voters;
        this.keysRepository = keysRepository;
        this.keys = keys;
        this.tokens = tokens;
        this.pending = pending;
        this.audit = audit;
    }

    @Transactional
    public void reissue(Long electionId, VotingDtos.ReissueRequest request) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        Election election = a.election();
        if (election.getStatus() != com.digivote.election.ElectionStatus.VOTING) {
            throw ApiException.conflict("VOTING_NOT_OPEN", "Voting is not open");
        }
        // Same lock as casting and confirming, so the three cannot interleave.
        ElectionKeys k = keysRepository.lockForBallot(electionId)
                .orElseThrow(() -> ApiException.conflict("KEYS_MISSING", "Voting has not been opened"));
        byte[] token = HexFormat.of().parseHex(request.tokenHex());
        if (!BlindRsa.verify(keys.rsaPublic(k), token, new BigInteger(request.signatureHex(), 16))) {
            throw ApiException.forbidden("The voting credential is not valid for this election");
        }
        EligibleVoter voter = voters.lockByElectionIdAndUserId(electionId, a.user().userId())
                .filter(EligibleVoter::isEligible)
                .orElseThrow(() -> ApiException.forbidden("Not eligible to vote"));
        String tokenHash = BallotTransaction.tokenHash(electionId, token);
        VotingToken spent = tokens.findByElectionIdAndTokenHash(electionId, tokenHash)
                .orElseThrow(() -> ApiException.conflict("TOKEN_UNUSED",
                        "This credential has not been used yet; use it to vote"));
        PendingConfirmation marker = pending.findById(spent.getBallotId())
                .orElseThrow(() -> ApiException.conflict("BALLOT_CONFIRMED",
                        "This ballot was already confirmed and counted; it cannot be replaced"));
        if (!marker.isVoided()) {
            marker.voidIt();
        }
        voter.nextCredentialGeneration();
        audit.record(AuditEventType.CREDENTIAL_REISSUED, election.getOrganizationId(), electionId, a.user().userId(),
                Map.of("generation", voter.getCredentialGeneration()));
    }
}
