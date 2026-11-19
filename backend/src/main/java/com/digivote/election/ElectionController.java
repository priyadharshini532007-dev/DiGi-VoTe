package com.digivote.election;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.common.PageResponse;
import com.digivote.election.rules.RuleEngine;
import com.digivote.election.state.ElectionLifecycleService;
import com.digivote.result.ResultDtos;
import com.digivote.result.ResultService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api")
@Tag(name = "Elections, rules, lifecycle and results")
public class ElectionController {

    private final ElectionService elections;
    private final ElectionLifecycleService lifecycle;
    private final ReadinessService readiness;
    private final ResultService results;
    private final ElectionRuleRepository rules;
    private final RuleEngine ruleEngine;
    private final AccessControlService access;

    public ElectionController(ElectionService elections, ElectionLifecycleService lifecycle,
                              ReadinessService readiness, ResultService results, ElectionRuleRepository rules,
                              RuleEngine ruleEngine, AccessControlService access) {
        this.elections = elections;
        this.lifecycle = lifecycle;
        this.readiness = readiness;
        this.results = results;
        this.rules = rules;
        this.ruleEngine = ruleEngine;
        this.access = access;
    }

    @GetMapping("/orgs/{orgId}/elections")
    public PageResponse<ElectionDtos.ElectionView> list(@PathVariable Long orgId,
                                                        @RequestParam(defaultValue = "0") int page,
                                                        @RequestParam(defaultValue = "20") int size) {
        return elections.list(orgId, page, size);
    }

    @PostMapping("/orgs/{orgId}/elections")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a draft election (owner or election administrator)")
    public ElectionDtos.ElectionView create(@PathVariable Long orgId,
                                            @Valid @RequestBody ElectionDtos.CreateElectionRequest request) {
        return elections.create(orgId, request);
    }

    @GetMapping("/me/elections")
    @Operation(summary = "Elections in which the current user is on the voter list")
    public List<ElectionDtos.ElectionView> myElections() {
        return elections.myElections();
    }

    @GetMapping("/elections/{electionId}")
    public ElectionDtos.ElectionView get(@PathVariable Long electionId) {
        return elections.get(electionId);
    }

    @PutMapping("/elections/{electionId}")
    public ElectionDtos.ElectionView update(@PathVariable Long electionId,
                                            @Valid @RequestBody ElectionDtos.UpdateElectionRequest request) {
        return elections.update(electionId, request);
    }

    @PutMapping(value = "/elections/{electionId}/banner", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Set the election banner (PNG or JPEG, up to 2 MB; while details are editable)")
    public ElectionDtos.ElectionView setBanner(@PathVariable Long electionId, @RequestPart("file") MultipartFile file) {
        return elections.setBanner(electionId, file);
    }

    @DeleteMapping("/elections/{electionId}/banner")
    public ElectionDtos.ElectionView clearBanner(@PathVariable Long electionId) {
        return elections.clearBanner(electionId);
    }

    @GetMapping("/elections/{electionId}/banner")
    public ResponseEntity<byte[]> banner(@PathVariable Long electionId) {
        ElectionService.BannerContent content = elections.banner(electionId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(content.contentType()))
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache")
                .header("X-Content-Type-Options", "nosniff")
                .body(content.bytes());
    }

    @PutMapping("/elections/{electionId}/rules")
    @Operation(summary = "Replace the election's rule set (validated by the rule engine)")
    public ElectionDtos.ElectionView updateRules(@PathVariable Long electionId,
                                                 @Valid @RequestBody ElectionDtos.RulesRequest request) {
        return elections.updateRules(electionId, request);
    }

    @PostMapping("/elections/{electionId}/rules/validate")
    @Operation(summary = "Check a rule set for publication without saving it")
    public List<com.digivote.election.rules.RuleViolation> validateRules(@PathVariable Long electionId,
                                                                          @Valid @RequestBody ElectionDtos.RulesRequest request) {
        access.requireElection(electionId, Permission.MANAGE_ELECTION);
        return ruleEngine.validateForPublication(request.toSettings(), java.time.Instant.now());
    }

    @PostMapping("/elections/{electionId}/transitions")
    @Operation(summary = "Move the election to its next lifecycle state (validated state machine)")
    public ElectionDtos.ElectionView transition(@PathVariable Long electionId,
                                                @Valid @RequestBody ElectionDtos.TransitionRequest request) {
        lifecycle.transition(electionId, request.target(), request.note());
        return elections.get(electionId);
    }

    @GetMapping("/elections/{electionId}/readiness")
    public ReadinessService.Readiness readiness(@PathVariable Long electionId) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.VIEW_ELECTION_INTERNALS);
        return readiness.evaluate(a.election());
    }

    @GetMapping("/elections/{electionId}/timeline")
    public List<ElectionDtos.TimelineEntry> timeline(@PathVariable Long electionId) {
        return elections.timeline(electionId);
    }

    @GetMapping("/elections/{electionId}/administrators")
    public List<ElectionDtos.AdministratorView> administrators(@PathVariable Long electionId) {
        return elections.listAdministrators(electionId);
    }

    @PostMapping("/elections/{electionId}/administrators")
    @Operation(summary = "Assign an Election Administrator to this election (owner)")
    public List<ElectionDtos.AdministratorView> assign(@PathVariable Long electionId,
                                                       @Valid @RequestBody ElectionDtos.AssignAdministratorRequest request) {
        return elections.assignAdministrator(electionId, request.userId());
    }

    @PostMapping("/elections/{electionId}/results/generate")
    @Operation(summary = "Tally accepted ballots homomorphically (repeatable until published)")
    public ResultDtos.ResultView generateResults(@PathVariable Long electionId) {
        ResultDtos.ResultView view = results.generate(electionId);
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        if (ruleEngine.autoPublishAfterGeneration(rule)) {
            lifecycle.transition(electionId, ElectionStatus.PUBLISHED, "Published automatically by election policy");
            return results.forMember(electionId);
        }
        return view;
    }

    @GetMapping("/elections/{electionId}/results")
    public ResultDtos.ResultView results(@PathVariable Long electionId) {
        return results.forMember(electionId);
    }
}
