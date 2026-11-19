package com.digivote.audit;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.access.User;
import com.digivote.common.PageResponse;
import com.digivote.result.ResultDtos;
import com.digivote.result.ResultService;
import com.digivote.verification.BulletinBoardService;
import com.digivote.verification.PublicController;
import com.digivote.voting.BulletinBoardRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api")
@Tag(name = "Audit logs, integrity and security events")
public class AuditController {

    private final AuditLogRepository logs;
    private final AuditIntegrityService integrity;
    private final SecurityEventRepository securityEvents;
    private final AccessControlService access;
    private final BulletinBoardRepository bulletinEntries;
    private final BulletinBoardService bulletin;
    private final ResultService results;

    public AuditController(AuditLogRepository logs, AuditIntegrityService integrity,
                           SecurityEventRepository securityEvents, AccessControlService access,
                           BulletinBoardRepository bulletinEntries, BulletinBoardService bulletin,
                           ResultService results) {
        this.logs = logs;
        this.integrity = integrity;
        this.securityEvents = securityEvents;
        this.access = access;
        this.bulletinEntries = bulletinEntries;
        this.bulletin = bulletin;
        this.results = results;
    }

    public record AuditLogView(long seq, String eventId, String eventType, Instant occurredAt, Long electionId,
                               String actorRef, String metadataJson, String prevHash, String recordHash) {
        static AuditLogView of(AuditLog l) {
            return new AuditLogView(l.getSeq(), l.getEventId(), l.getEventType(), l.getOccurredAt(), l.getElectionId(),
                    l.getActorRef(), l.getMetadataJson(), l.getPrevHash(), l.getRecordHash());
        }
    }

    public record SecurityEventView(Long id, String eventType, String severity, String principalRef, String detail,
                                    Instant occurredAt) {
    }

    @GetMapping("/orgs/{orgId}/audit-logs")
    @Transactional(readOnly = true)
    public PageResponse<AuditLogView> auditLogs(@PathVariable Long orgId, @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "50") int size,
                                                @RequestParam(required = false) String typePrefix) {
        access.require(orgId, Permission.VIEW_AUDIT_LOGS);
        var pageable = PageResponse.pageable(page, size, Sort.by(Sort.Direction.DESC, "seq"));
        String chain = AuditService.chainKey(orgId);
        var result = typePrefix == null || typePrefix.isBlank()
                ? logs.findByChainKey(chain, pageable)
                : logs.findByChainKeyAndEventTypeStartingWith(chain, typePrefix, pageable);
        return PageResponse.of(result, AuditLogView::of);
    }

    @PostMapping("/orgs/{orgId}/audit-logs/verify")
    @Operation(summary = "Recompute the organization's audit hash chain from genesis")
    public AuditIntegrityService.ChainVerification verify(@PathVariable Long orgId) {
        User user = access.require(orgId, Permission.VERIFY_INTEGRITY);
        return integrity.verifyAndRecord(orgId, user.userId());
    }

    @GetMapping("/orgs/{orgId}/security-events")
    @Transactional(readOnly = true)
    public PageResponse<SecurityEventView> securityEvents(@PathVariable Long orgId,
                                                          @RequestParam(defaultValue = "0") int page,
                                                          @RequestParam(defaultValue = "50") int size) {
        access.require(orgId, Permission.VIEW_SECURITY_EVENTS);
        var result = securityEvents.findByOrganizationId(orgId,
                PageResponse.pageable(page, size, Sort.by(Sort.Direction.DESC, "occurredAt")));
        return PageResponse.of(result, s -> new SecurityEventView(s.getId(), s.getEventType(), s.getSeverity(),
                s.getPrincipalRef(), s.getDetail(), s.getOccurredAt()));
    }

    @GetMapping("/elections/{electionId}/audit-trail")
    @Transactional(readOnly = true)
    @Operation(summary = "Audit events for one election, oldest first")
    public List<AuditLogView> electionAudit(@PathVariable Long electionId) {
        access.requireElection(electionId, Permission.VIEW_AUDIT_LOGS);
        return logs.findByElectionIdOrderBySeqAsc(electionId).stream().map(AuditLogView::of).toList();
    }

    @GetMapping("/elections/{electionId}/bulletin")
    @Transactional(readOnly = true)
    @Operation(summary = "Bulletin board for organization members (regardless of public visibility)")
    public PublicController.BulletinPage bulletin(@PathVariable Long electionId,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "50") int size) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        var result = bulletinEntries.findByElectionId(electionId, PageResponse.pageable(page, size, Sort.by("seq")));
        return new PublicController.BulletinPage(electionId, a.election().getTitle(),
                PageResponse.of(result, e -> new PublicController.BulletinEntryView(e.getSeq(), e.getBallotCommitment(),
                        e.getPrevHash(), e.getEntryHash(), e.getPostedAtMinute())),
                bulletin.verify(electionId));
    }

    @GetMapping("/elections/{electionId}/integrity/aggregation")
    @Operation(summary = "Recompute ballot commitments and homomorphic aggregates (auditor check)")
    public ResultDtos.AggregationCheck aggregation(@PathVariable Long electionId) {
        access.requireElection(electionId, Permission.VERIFY_INTEGRITY);
        return results.verifyAggregation(electionId);
    }
}
