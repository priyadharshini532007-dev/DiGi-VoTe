package com.digivote.report;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.access.User;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditIntegrityService;
import com.digivote.audit.AuditLogRepository;
import com.digivote.audit.AuditService;
import com.digivote.audit.SecurityEventRepository;
import com.digivote.candidate.CandidateService;
import com.digivote.common.ApiException;
import com.digivote.common.Hashing;
import com.digivote.common.PageResponse;
import com.digivote.election.Election;
import com.digivote.election.ElectionDtos;
import com.digivote.election.ElectionService;
import com.digivote.election.ReadinessService;
import com.digivote.result.ResultService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Generates report snapshots from persisted data. Reports contain aggregate figures only: no voter
 * identities, no credential material, no individual ballot content.
 */
@Service
public class ReportService {

    private final ReportRepository reports;
    private final AccessControlService access;
    private final ElectionService elections;
    private final CandidateService candidates;
    private final ResultService results;
    private final ReadinessService readiness;
    private final TrustService trust;
    private final AuditIntegrityService auditIntegrity;
    private final AuditLogRepository auditLogs;
    private final SecurityEventRepository securityEvents;
    private final AuditService audit;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Clock clock;

    public ReportService(ReportRepository reports, AccessControlService access, ElectionService elections,
                         CandidateService candidates, ResultService results, ReadinessService readiness,
                         TrustService trust, AuditIntegrityService auditIntegrity, AuditLogRepository auditLogs,
                         SecurityEventRepository securityEvents, AuditService audit, JdbcTemplate jdbc,
                         ObjectMapper mapper, Clock clock) {
        this.reports = reports;
        this.access = access;
        this.elections = elections;
        this.candidates = candidates;
        this.results = results;
        this.readiness = readiness;
        this.trust = trust;
        this.auditIntegrity = auditIntegrity;
        this.auditLogs = auditLogs;
        this.securityEvents = securityEvents;
        this.audit = audit;
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.clock = clock;
    }

    public record ReportView(Long id, String type, Long electionId, Instant generatedAt, String contentHash,
                             Object content) {
    }

    public record ReportSummary(Long id, String type, Long electionId, Instant generatedAt, String contentHash) {
    }

    /** Participation figures from the stored procedure sp_election_participation. */
    public Map<String, Object> participation(Long electionId) {
        return jdbc.queryForMap("CALL sp_election_participation(?)", electionId);
    }

    @Transactional
    public ReportView generateForElection(Long electionId, Report.Type type) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.GENERATE_REPORTS);
        Election election = a.election();
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("application", "DIGI-VOTE");
        content.put("reportType", type.name());
        content.put("electionId", electionId);
        content.put("electionTitle", election.getTitle());
        content.put("electionStatus", election.getStatus().name());
        switch (type) {
            case ELECTION -> {
                ElectionDtos.ElectionView view = elections.get(electionId);
                content.put("configuration", view.rules());
                content.put("candidates", candidates.candidatesFor(electionId).stream()
                        .map(c -> Map.of("ballotPosition", c.ballotPosition(), "name", c.displayName(),
                                "status", c.status())).toList());
                content.put("lifecycle", elections.timeline(electionId));
                content.put("participation", participation(electionId));
                content.put("results", results.find(electionId).isPresent() ? results.forMember(electionId) : null);
            }
            case PARTICIPATION -> content.put("participation", participation(electionId));
            case HEALTH -> {
                content.put("readiness", readiness.evaluate(election));
                content.put("trust", trust.evaluate(election));
            }
            case AUDIT -> {
                content.put("auditChain", auditIntegrity.verify(AuditService.chainKey(election.getOrganizationId())));
                content.put("electionEvents", auditLogs.findByElectionIdOrderBySeqAsc(electionId).stream()
                        .collect(java.util.stream.Collectors.groupingBy(l -> l.getEventType(),
                                java.util.TreeMap::new, java.util.stream.Collectors.counting())));
                content.put("trust", trust.evaluate(election));
            }
            case SECURITY -> content.put("securityEventsByType", securityByType(election.getOrganizationId()));
        }
        return save(election.getOrganizationId(), electionId, type, a.user(), content);
    }

    @Transactional
    public ReportView generateForOrganization(Long orgId, Report.Type type) {
        User user = access.require(orgId, Permission.GENERATE_REPORTS);
        if (type != Report.Type.AUDIT && type != Report.Type.SECURITY) {
            throw ApiException.badRequest("ELECTION_REQUIRED", "This report type is generated per election");
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("application", "DIGI-VOTE");
        content.put("reportType", type.name());
        content.put("organizationId", orgId);
        if (type == Report.Type.AUDIT) {
            String chain = AuditService.chainKey(orgId);
            content.put("auditChain", auditIntegrity.verify(chain));
            Map<String, Long> byType = new java.util.TreeMap<>();
            auditLogs.countByEventType(chain).forEach(r -> byType.put((String) r[0], (Long) r[1]));
            content.put("eventsByType", byType);
        } else {
            content.put("securityEventsByType", securityByType(orgId));
            content.put("authenticationFailures", securityEvents.countByOrganizationIdAndEventType(orgId, "AUTH_FAILURE"));
            content.put("authorizationFailures",
                    securityEvents.countByOrganizationIdAndEventType(orgId, "AUTHORIZATION_DENIED"));
            content.put("accountLockouts", securityEvents.countByOrganizationIdAndEventType(orgId, "ACCOUNT_LOCKED"));
            content.put("crossOrganizationAttempts",
                    securityEvents.countByOrganizationIdAndEventType(orgId, "CROSS_ORG_ACCESS"));
            content.put("suspiciousBallotActivity",
                    securityEvents.countByOrganizationIdAndEventType(orgId, "DUPLICATE_BALLOT")
                            + securityEvents.countByOrganizationIdAndEventType(orgId, "INVALID_CREDENTIAL"));
            content.put("rejectedUploads", securityEvents.countByOrganizationIdAndEventType(orgId, "UPLOAD_REJECTED"));
        }
        return save(orgId, null, type, user, content);
    }

    @Transactional(readOnly = true)
    public PageResponse<ReportSummary> list(Long orgId, int page, int size) {
        access.require(orgId, Permission.VIEW_REPORTS);
        return PageResponse.of(reports.findByOrganizationId(orgId,
                        PageResponse.pageable(page, size, Sort.by(Sort.Direction.DESC, "generatedAt"))),
                r -> new ReportSummary(r.getId(), r.getReportType(), r.getElectionId(), r.getGeneratedAt(),
                        r.getContentHash()));
    }

    @Transactional(readOnly = true)
    public ReportView get(Long reportId) {
        Report r = reports.findById(reportId).orElseThrow(() -> ApiException.notFound("Report"));
        access.require(r.getOrganizationId(), Permission.VIEW_REPORTS);
        return view(r);
    }

    private Map<String, Long> securityByType(Long orgId) {
        Map<String, Long> byType = new java.util.TreeMap<>();
        securityEvents.countByType(orgId).forEach(row -> byType.put((String) row[0], (Long) row[1]));
        return byType;
    }

    private ReportView save(Long orgId, Long electionId, Report.Type type, User user, Map<String, Object> content) {
        String json;
        try {
            json = mapper.writeValueAsString(content);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Report serialization failed", e);
        }
        Report report = reports.save(new Report(orgId, electionId, type, user.userId(), clock.instant(), json,
                Hashing.sha256Hex(json)));
        audit.record(AuditEventType.REPORT_GENERATED, orgId, electionId, user.userId(),
                Map.of("reportType", type.name(), "reportId", report.getId(), "contentHash", report.getContentHash()));
        return view(report);
    }

    private ReportView view(Report r) {
        try {
            return new ReportView(r.getId(), r.getReportType(), r.getElectionId(), r.getGeneratedAt(),
                    r.getContentHash(), mapper.readValue(r.getContentJson(), Object.class));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored report is not valid JSON", e);
        }
    }
}
