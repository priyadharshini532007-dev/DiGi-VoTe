package com.digivote.report;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.common.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
@Tag(name = "Reports, analytics and the Election Trust Dashboard")
public class ReportController {

    private final ReportService reports;
    private final TrustService trust;
    private final AccessControlService access;

    public ReportController(ReportService reports, TrustService trust, AccessControlService access) {
        this.reports = reports;
        this.trust = trust;
        this.access = access;
    }

    @PostMapping("/elections/{electionId}/reports")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Generate an ELECTION, PARTICIPATION, HEALTH, AUDIT or SECURITY report for an election")
    public ReportService.ReportView electionReport(@PathVariable Long electionId, @RequestParam Report.Type type) {
        return reports.generateForElection(electionId, type);
    }

    @PostMapping("/orgs/{orgId}/reports")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Generate an organization-wide AUDIT or SECURITY report")
    public ReportService.ReportView orgReport(@PathVariable Long orgId, @RequestParam Report.Type type) {
        return reports.generateForOrganization(orgId, type);
    }

    @GetMapping("/orgs/{orgId}/reports")
    public PageResponse<ReportService.ReportSummary> list(@PathVariable Long orgId,
                                                          @RequestParam(defaultValue = "0") int page,
                                                          @RequestParam(defaultValue = "20") int size) {
        return reports.list(orgId, page, size);
    }

    @GetMapping("/reports/{reportId}")
    public ReportService.ReportView get(@PathVariable Long reportId) {
        return reports.get(reportId);
    }

    @GetMapping("/elections/{electionId}/trust")
    @Operation(summary = "Election Trust Dashboard: live integrity checks")
    public TrustService.TrustReport trust(@PathVariable Long electionId) {
        return trust.evaluate(access.requireElection(electionId, Permission.VIEW_ELECTION_INTERNALS).election());
    }

    @GetMapping("/elections/{electionId}/participation")
    @Operation(summary = "Participation figures (stored procedure sp_election_participation)")
    public Map<String, Object> participation(@PathVariable Long electionId) {
        access.requireElection(electionId, Permission.VIEW_ELECTION_INTERNALS);
        return reports.participation(electionId);
    }
}
