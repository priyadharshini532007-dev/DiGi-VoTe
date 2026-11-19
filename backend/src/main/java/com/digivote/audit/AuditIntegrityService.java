package com.digivote.audit;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Recomputes an audit chain from genesis. Detects edited records (hash mismatch), removed or
 * re-ordered records (sequence gaps, broken prev-hash links) and truncation of the tail (head
 * mismatch). It cannot detect a privileged actor who rewrites the entire chain and its head
 * consistently; anchoring the head hash externally (e.g. in published results) narrows that gap.
 */
@Service
public class AuditIntegrityService {

    private final AuditLogRepository logs;
    private final AuditChainHeadRepository heads;
    private final AuditService audit;
    private final Clock clock;

    public AuditIntegrityService(AuditLogRepository logs, AuditChainHeadRepository heads, AuditService audit,
                                 Clock clock) {
        this.logs = logs;
        this.heads = heads;
        this.audit = audit;
        this.clock = clock;
    }

    public record ChainVerification(String chainKey, boolean valid, long recordsChecked, Long firstInvalidSeq,
                                    String headHash, List<String> problems, Instant verifiedAt) {
    }

    @Transactional(readOnly = true)
    public ChainVerification verify(String chainKey) {
        List<AuditLog> records = logs.findByChainKeyOrderBySeqAsc(chainKey);
        List<String> problems = new ArrayList<>();
        Long firstInvalid = null;
        String expectedPrev = AuditHasher.GENESIS;
        long expectedSeq = 1;
        for (AuditLog r : records) {
            String problem = null;
            if (r.getSeq() != expectedSeq) {
                problem = "Sequence gap: expected " + expectedSeq + " but found " + r.getSeq();
            } else if (!r.getPrevHash().equals(expectedPrev)) {
                problem = "Broken link at seq " + r.getSeq() + ": previous hash does not match";
            } else if (!AuditHasher.hash(r).equals(r.getRecordHash())) {
                problem = "Record seq " + r.getSeq() + " was modified: hash mismatch";
            }
            if (problem != null) {
                problems.add(problem);
                if (firstInvalid == null) {
                    firstInvalid = r.getSeq();
                }
            }
            expectedPrev = r.getRecordHash();
            expectedSeq = r.getSeq() + 1;
        }
        String headHash = records.isEmpty() ? AuditHasher.GENESIS : records.get(records.size() - 1).getRecordHash();
        heads.findById(chainKey).ifPresent(head -> {
            if (head.getLastSeq() != records.size() || !head.getLastHash().equals(headHash)) {
                problems.add("Chain head does not match the last record (records removed or appended out of band)");
            }
        });
        return new ChainVerification(chainKey, problems.isEmpty(), records.size(), firstInvalid, headHash,
                List.copyOf(problems), clock.instant());
    }

    /** Verifies and records the outcome as an audit event of its own. */
    @Transactional
    public ChainVerification verifyAndRecord(Long organizationId, Long actorUserId) {
        ChainVerification result = verify(AuditService.chainKey(organizationId));
        audit.record(AuditEventType.INTEGRITY_VERIFIED, organizationId, null, actorUserId,
                Map.of("valid", result.valid(), "recordsChecked", result.recordsChecked(),
                        "problemCount", result.problems().size()));
        return result;
    }
}
