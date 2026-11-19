package com.digivote.organization;

import com.digivote.common.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
@Tag(name = "Organizations, members and roles")
public class OrganizationController {

    private final OrganizationService service;
    private final JdbcTemplate jdbc;

    public OrganizationController(OrganizationService service, JdbcTemplate jdbc) {
        this.service = service;
        this.jdbc = jdbc;
    }

    @GetMapping("/roles")
    @Operation(summary = "The five DIGI-VOTE roles")
    public List<OrganizationDtos.RoleView> roles() {
        return jdbc.query("SELECT code, name, description FROM roles ORDER BY FIELD(code,"
                        + "'ORG_OWNER','ELECTION_ADMIN','CANDIDATE','VOTER','AUDITOR')",
                (rs, i) -> new OrganizationDtos.RoleView(rs.getString(1), rs.getString(2), rs.getString(3)));
    }

    @GetMapping("/orgs/{orgId}")
    public OrganizationDtos.OrganizationView get(@PathVariable Long orgId) {
        return service.get(orgId);
    }

    @PutMapping("/orgs/{orgId}")
    @Operation(summary = "Update organization profile and branding (owner)")
    public OrganizationDtos.OrganizationView update(@PathVariable Long orgId,
                                                    @Valid @RequestBody OrganizationDtos.UpdateOrganizationRequest request) {
        return service.update(orgId, request);
    }

    @PutMapping("/orgs/{orgId}/security-policy")
    @Operation(summary = "Configure password and lockout policy (owner)")
    public OrganizationDtos.OrganizationView securityPolicy(@PathVariable Long orgId,
                                                            @Valid @RequestBody OrganizationDtos.SecurityPolicyRequest request) {
        return service.updateSecurityPolicy(orgId, request);
    }

    @GetMapping("/orgs/{orgId}/overview")
    public OrganizationDtos.OverviewView overview(@PathVariable Long orgId) {
        return service.overview(orgId);
    }

    @GetMapping("/orgs/{orgId}/members")
    public PageResponse<OrganizationDtos.MemberView> members(@PathVariable Long orgId,
                                                             @RequestParam(defaultValue = "0") int page,
                                                             @RequestParam(defaultValue = "25") int size) {
        return service.members(orgId, page, size);
    }

    @PostMapping("/orgs/{orgId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Invite a member with a role; returns a one-time activation code (owner)")
    public OrganizationDtos.InvitationView invite(@PathVariable Long orgId,
                                                  @Valid @RequestBody OrganizationDtos.InviteMemberRequest request) {
        return service.invite(orgId, request);
    }

    @PostMapping("/orgs/{orgId}/members/{membershipId}/recovery")
    @Operation(summary = "Generate a one-time password recovery code for a member (owner)")
    public OrganizationDtos.RecoveryView recovery(@PathVariable Long orgId, @PathVariable Long membershipId) {
        return service.startRecovery(orgId, membershipId);
    }

    @PatchMapping("/orgs/{orgId}/members/{membershipId}/role")
    public OrganizationDtos.MemberView changeRole(@PathVariable Long orgId, @PathVariable Long membershipId,
                                                  @Valid @RequestBody OrganizationDtos.ChangeRoleRequest request) {
        return service.changeRole(orgId, membershipId, request.role());
    }

    @PatchMapping("/orgs/{orgId}/members/{membershipId}/status")
    @Operation(summary = "Suspend, reactivate or remove a member (owner)")
    public OrganizationDtos.MemberView changeStatus(@PathVariable Long orgId, @PathVariable Long membershipId,
                                                    @Valid @RequestBody OrganizationDtos.ChangeStatusRequest request) {
        return service.changeStatus(orgId, membershipId, request.status());
    }
}
