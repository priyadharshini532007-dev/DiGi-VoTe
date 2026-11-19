package com.digivote.voting;

import com.digivote.access.AccessControlService;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.common.ApiException;
import com.digivote.common.Hashing;
import com.digivote.crypto.BlindRsa;
import com.digivote.crypto.CredentialKeyFingerprint;
import com.digivote.election.Election;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.time.Clock;
import java.util.Map;

/**
 * Issues one blind-signed voting credential per eligible voter. The server signs the blinded value
 * sent by the voter's browser and never sees the token it will later be presented with, so the
 * issuance record cannot be linked to the ballot by the database contents.
 */
@Service
public class CredentialIssuanceService {

    private final EligibilityService eligibility;
    private final EligibleVoterRepository voters;
    private final VotingCredentialRepository credentials;
    private final ElectionKeyService keys;
    private final ElectionKeysRepository keysRepository;
    private final AccessControlService access;
    private final AuditService audit;
    private final Clock clock;

    public CredentialIssuanceService(EligibilityService eligibility, EligibleVoterRepository voters,
                                     VotingCredentialRepository credentials, ElectionKeyService keys,
                                     ElectionKeysRepository keysRepository,
                                     AccessControlService access, AuditService audit, Clock clock) {
        this.eligibility = eligibility;
        this.voters = voters;
        this.credentials = credentials;
        this.keys = keys;
        this.keysRepository = keysRepository;
        this.access = access;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public VotingDtos.CredentialKeyView publicKey(Long electionId) {
        access.viewElection(electionId);
        ElectionKeys k = keys.require(electionId);
        return keyView(k);
    }

    static VotingDtos.CredentialKeyView keyView(ElectionKeys k) {
        BigInteger n = new BigInteger(k.getRsaModulus(), 16);
        BigInteger e = new BigInteger(k.getRsaPublicExponent(), 16);
        return new VotingDtos.CredentialKeyView(k.getElectionId(), CredentialKeyFingerprint.VERSION,
                CredentialKeyFingerprint.PROTOCOL, n.toString(16), e.toString(16),
                CredentialKeyFingerprint.of(k.getElectionId(), n, e), k.getRsaFingerprint(), "DIGI-VOTE-FDH-v1",
                n.bitLength());
    }

    /**
     * Unauthenticated, election-wide view of the same key: identical for every caller and not tied to a voter
     * session, so browsers can compare it with the key they receive while signed in.
     */
    @Transactional(readOnly = true)
    public VotingDtos.CredentialKeyView publicAnchor(Long electionId) {
        return keyView(keysRepository.findById(electionId)
                .orElseThrow(() -> ApiException.notFound("Credential key")));
    }

    @Transactional
    public VotingDtos.CredentialResponse issue(Long electionId, String blindedHex) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        Election election = a.election();
        EligibilityService.Decision decision = eligibility.evaluate(election, a.user());
        if (!decision.mayVote()) {
            throw ApiException.forbidden(decision.reasons().isEmpty() ? "Not eligible to vote"
                    : decision.reasons().get(0));
        }
        if (!decision.votingOpen()) {
            throw ApiException.conflict("VOTING_NOT_OPEN", "Voting is not open");
        }
        // Row lock: concurrent issuance requests for the same voter are serialized.
        EligibleVoter voter = voters.lockByElectionIdAndUserId(electionId, a.user().userId()).orElseThrow();
        String requestHash = Hashing.sha256Hex(blindedHex.toLowerCase());
        ElectionKeys k = keys.require(electionId);
        var existing = credentials.findByEligibleVoterIdAndGeneration(voter.getId(), voter.getCredentialGeneration());
        if (existing.isPresent()) {
            if (Hashing.constantTimeEquals(existing.get().getBlindedRequestHash(), requestHash)) {
                // Safe retry of the identical request: same blinded value, same signature, no new entitlement.
                return new VotingDtos.CredentialResponse(electionId, existing.get().getBlindSignature(),
                        k.getRsaFingerprint(), true);
            }
            throw ApiException.conflict("CREDENTIAL_ALREADY_ISSUED",
                    "A voting credential was already issued to you for this election");
        }
        BigInteger blinded = new BigInteger(blindedHex, 16);
        BigInteger signature;
        try {
            signature = BlindRsa.signBlinded(keys.rsaPrivate(k), blinded);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_BLINDED_MESSAGE", "Blinded message is out of range");
        }
        String sigHex = signature.toString(16);
        VotingCredential issuedCredential = new VotingCredential(voter.getId(), electionId, requestHash, sigHex,
                k.getRsaFingerprint(), clock.instant());
        issuedCredential.setGeneration(voter.getCredentialGeneration());
        credentials.save(issuedCredential);
        audit.record(AuditEventType.CREDENTIAL_ISSUED, election.getOrganizationId(), electionId, a.user().userId(),
                Map.of("keyFingerprint", k.getRsaFingerprint()));
        return new VotingDtos.CredentialResponse(electionId, sigHex, k.getRsaFingerprint(), false);
    }
}
