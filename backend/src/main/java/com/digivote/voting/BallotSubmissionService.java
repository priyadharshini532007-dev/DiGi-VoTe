package com.digivote.voting;

import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.audit.SecurityEvent;
import com.digivote.audit.SecurityEventService;
import com.digivote.common.ApiException;
import com.digivote.election.ElectionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Non-transactional entry point for ballot submission. Runs {@link BallotTransaction}; when it is
 * rejected, the ballot transaction has already rolled back, and the rejection is then recorded as a
 * security event and an audit event in their own transactions.
 *
 * <p>A concurrent duplicate that slips past the in-transaction check is stopped by the
 * UNIQUE(election_id, token_hash) constraint; that violation is reported as a duplicate vote.
 */
@Service
public class BallotSubmissionService {

    private static final Logger log = LoggerFactory.getLogger(BallotSubmissionService.class);

    private final BallotTransaction ballots;
    private final ElectionRepository elections;
    private final SecurityEventService securityEvents;
    private final AuditService audit;

    public BallotSubmissionService(BallotTransaction ballots, ElectionRepository elections,
                                   SecurityEventService securityEvents, AuditService audit) {
        this.ballots = ballots;
        this.elections = elections;
        this.securityEvents = securityEvents;
        this.audit = audit;
    }

    public VotingDtos.ReceiptView submit(Long electionId, VotingDtos.CastBallotRequest request) {
        try {
            return ballots.cast(electionId, request);
        } catch (BallotRejectedException e) {
            recordRejection(electionId, e.getEventType(), e.getCode());
            throw e;
        } catch (DataIntegrityViolationException e) {
            recordRejection(electionId, SecurityEvent.Type.DUPLICATE_BALLOT, "DUPLICATE_VOTE");
            throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_VOTE",
                    "This credential has already been used to cast a ballot");
        }
    }

    /**
     * Records the rejection; retried briefly on lock contention so that a burst of concurrent duplicates
     * still leaves one security event and one audit event per rejected attempt. Recording failures never
     * change the answer the client gets (the ballot was rejected either way).
     */
    private void recordRejection(Long electionId, SecurityEvent.Type type, String code) {
        Long orgId = elections.findById(electionId).map(e -> e.getOrganizationId()).orElse(null);
        SecurityEvent.Severity severity = type == SecurityEvent.Type.BALLOT_OUTSIDE_WINDOW
                ? SecurityEvent.Severity.LOW : SecurityEvent.Severity.HIGH;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                securityEvents.record(orgId, type, severity, null,
                        "Ballot rejected: " + code + " (election " + electionId + ")");
                audit.recordIndependently(AuditEventType.BALLOT_REJECTED, orgId, electionId, null, Map.of("reason", code));
                return;
            } catch (TransientDataAccessException e) {
                if (attempt == 3) {
                    log.error("Could not record ballot rejection {} for election {}", code, electionId);
                }
            }
        }
    }
}
