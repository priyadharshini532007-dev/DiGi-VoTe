package com.digivote.candidate;

import com.digivote.access.AccessControlService;
import com.digivote.access.Permission;
import com.digivote.access.User;
import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.audit.SecurityEvent;
import com.digivote.audit.SecurityEventService;
import com.digivote.candidate.storage.MediaStorage;
import com.digivote.candidate.storage.ValidatingMediaStorage;
import com.digivote.common.ApiException;
import com.digivote.crypto.SecureTokens;
import com.digivote.election.Election;
import com.digivote.election.ElectionRepository;
import com.digivote.election.ElectionRule;
import com.digivote.election.ElectionRuleRepository;
import com.digivote.election.rules.RuleEngine;
import com.digivote.election.state.ElectionState;
import com.digivote.election.state.ElectionStateMachine;
import com.digivote.notification.NotificationService;
import com.digivote.user.UserAccount;
import com.digivote.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Candidate applications, approval workflow, profiles, manifestos and campaign media. */
@Service
public class CandidateService {

    private final CandidateApplicationRepository applications;
    private final CandidateRepository candidates;
    private final ManifestoRepository manifestos;
    private final CandidateMediaRepository media;
    private final ElectionRepository elections;
    private final ElectionRuleRepository rules;
    private final UserRepository users;
    private final AccessControlService access;
    private final ElectionStateMachine stateMachine;
    private final RuleEngine ruleEngine;
    private final ValidatingMediaStorage storage;
    private final NotificationService notifications;
    private final AuditService audit;
    private final SecurityEventService securityEvents;
    private final Clock clock;

    public CandidateService(CandidateApplicationRepository applications, CandidateRepository candidates,
                            ManifestoRepository manifestos, CandidateMediaRepository media,
                            ElectionRepository elections, ElectionRuleRepository rules, UserRepository users,
                            AccessControlService access, ElectionStateMachine stateMachine, RuleEngine ruleEngine,
                            ValidatingMediaStorage storage, NotificationService notifications, AuditService audit,
                            SecurityEventService securityEvents, Clock clock) {
        this.applications = applications;
        this.candidates = candidates;
        this.manifestos = manifestos;
        this.media = media;
        this.elections = elections;
        this.rules = rules;
        this.users = users;
        this.access = access;
        this.stateMachine = stateMachine;
        this.ruleEngine = ruleEngine;
        this.storage = storage;
        this.notifications = notifications;
        this.audit = audit;
        this.securityEvents = securityEvents;
        this.clock = clock;
    }

    // ------------------------------------------------------------------ applications

    @Transactional
    public CandidateDtos.ApplicationView apply(Long electionId, CandidateDtos.ApplicationRequest request) {
        AccessControlService.ElectionAccess a = access.requireElection(electionId, Permission.APPLY_AS_CANDIDATE);
        Election election = a.election();
        stateMachine.require(state(election).acceptsCandidateApplications(), election, "accept candidate applications");
        if (applications.findByElectionIdAndUserId(electionId, a.user().userId()).isPresent()) {
            throw ApiException.conflict("ALREADY_APPLIED", "You have already applied to this election");
        }
        Instant now = clock.instant();
        CandidateApplication newApp = new CandidateApplication(electionId, a.user().userId(),
                request.displayName().trim(), request.statement(), request.qualifications(), request.achievements(), now);
        newApp.setBackground(request.education(), request.experience());
        CandidateApplication app = applications.save(newApp);
        audit.record(AuditEventType.CANDIDATE_APPLIED, election.getOrganizationId(), electionId, a.user().userId(),
                Map.of("applicationId", app.getId()));
        ElectionRule rule = rules.findById(electionId).orElseThrow();
        if (!rule.isRequireCandidateApproval()) {
            app.review(CandidateApplication.Status.APPROVED, "Approval not required by election rules",
                    a.user().userId(), now);
            createCandidate(app, now);
        }
        return applicationView(app);
    }

    @Transactional
    public CandidateDtos.ApplicationView revise(Long applicationId, CandidateDtos.ApplicationRequest request) {
        CandidateApplication app = ownApplication(applicationId);
        Election election = elections.findById(app.getElectionId()).orElseThrow();
        stateMachine.require(state(election).acceptsCandidateApplications(), election, "edit applications");
        try {
            app.revise(request.displayName().trim(), request.statement(), request.qualifications(),
                    request.achievements(), clock.instant());
            app.setBackground(request.education(), request.experience());
        } catch (IllegalStateException e) {
            throw ApiException.conflict("APPLICATION_CLOSED", e.getMessage());
        }
        return applicationView(app);
    }

    @Transactional
    public CandidateDtos.ApplicationView review(Long applicationId, CandidateDtos.ReviewRequest request) {
        CandidateApplication app = applications.findById(applicationId)
                .orElseThrow(() -> ApiException.notFound("Application"));
        AccessControlService.ElectionAccess a = access.requireElection(app.getElectionId(), Permission.MANAGE_ELECTION);
        Election election = a.election();
        stateMachine.require(state(election).allowsCandidateReview(), election, "review candidates");
        if (app.getUserId().equals(a.user().userId())) {
            throw ApiException.rule("SELF_REVIEW", "You cannot review your own application");
        }
        CandidateApplication.Status decision = switch (request.decision()) {
            case APPROVE -> CandidateApplication.Status.APPROVED;
            case REJECT -> CandidateApplication.Status.REJECTED;
            case REQUEST_CORRECTION -> CandidateApplication.Status.CORRECTION_REQUESTED;
        };
        if (decision != CandidateApplication.Status.APPROVED && (request.note() == null || request.note().isBlank())) {
            throw ApiException.badRequest("NOTE_REQUIRED", "Explain the decision to the applicant");
        }
        Instant now = clock.instant();
        try {
            app.review(decision, request.note(), a.user().userId(), now);
        } catch (IllegalStateException e) {
            throw ApiException.conflict("NOT_REVIEWABLE", e.getMessage());
        }
        if (decision == CandidateApplication.Status.APPROVED) {
            createCandidate(app, now);
        }
        audit.record(AuditEventType.CANDIDATE_REVIEWED, election.getOrganizationId(), election.getId(),
                a.user().userId(), Map.of("applicationId", app.getId(), "decision", decision.name()));
        notifications.notifyUsers(List.of(app.getUserId()), election.getOrganizationId(), election.getId(),
                "APPLICATION_" + decision.name(), "Application " + decision.name().toLowerCase().replace('_', ' '),
                "Your application for \"" + election.getTitle() + "\" was " + decision.name().toLowerCase().replace('_', ' ')
                        + (request.note() == null || request.note().isBlank() ? "." : ": " + request.note()));
        return applicationView(app);
    }

    @Transactional
    public CandidateDtos.ApplicationView withdraw(Long applicationId) {
        CandidateApplication app = ownApplication(applicationId);
        Election election = elections.findById(app.getElectionId()).orElseThrow();
        ElectionRule rule = rules.findById(election.getId()).orElseThrow();
        ElectionState s = state(election);
        Instant now = clock.instant();
        if (!(s.acceptsCandidateApplications() || s.allowsCandidateReview()) || !ruleEngine.withdrawalAllowed(rule, now)) {
            throw ApiException.rule("WITHDRAWAL_CLOSED", "The withdrawal deadline for this election has passed");
        }
        try {
            app.withdraw(now);
        } catch (IllegalStateException e) {
            throw ApiException.conflict("APPLICATION_CLOSED", e.getMessage());
        }
        candidates.findByApplicationId(app.getId()).ifPresent(c -> c.withdraw(now));
        audit.record(AuditEventType.CANDIDATE_WITHDRAWN, election.getOrganizationId(), election.getId(),
                app.getUserId(), Map.of("applicationId", app.getId()));
        return applicationView(app);
    }

    @Transactional(readOnly = true)
    public List<CandidateDtos.ApplicationView> applicationsFor(Long electionId) {
        access.requireElection(electionId, Permission.VIEW_ELECTION_INTERNALS);
        return applications.findByElectionIdOrderBySubmittedAtAsc(electionId).stream().map(this::applicationView).toList();
    }

    @Transactional(readOnly = true)
    public List<CandidateDtos.ApplicationView> myApplications() {
        Long me = access.currentAccount().getId();
        return applications.findByUserIdOrderBySubmittedAtDesc(me).stream().map(this::applicationView).toList();
    }

    private void createCandidate(CandidateApplication app, Instant now) {
        int position = candidates.maxBallotPosition(app.getElectionId()) + 1;
        Candidate candidate = candidates.save(new Candidate(app, position, now));
        manifestos.save(new Manifesto(candidate.getId(), now));
    }

    // ------------------------------------------------------------------ candidates, profiles, manifestos

    @Transactional(readOnly = true)
    public List<CandidateDtos.CandidateView> candidatesFor(Long electionId) {
        AccessControlService.ElectionAccess a = access.viewElection(electionId);
        boolean privileged = a.operator() || a.user().can(Permission.VIEW_ELECTION_INTERNALS);
        return candidates.findByElectionIdOrderByBallotPositionAsc(electionId).stream()
                .filter(c -> privileged || c.isActive())
                .map(c -> candidateView(c, a.user().userId(), privileged))
                .toList();
    }

    @Transactional(readOnly = true)
    public CandidateDtos.CandidateView candidate(Long candidateId) {
        Candidate c = candidates.findById(candidateId).orElseThrow(() -> ApiException.notFound("Candidate"));
        AccessControlService.ElectionAccess a = access.viewElection(c.getElectionId());
        boolean privileged = a.operator() || a.user().can(Permission.VIEW_ELECTION_INTERNALS);
        if (!c.isActive() && !privileged && !c.getUserId().equals(a.user().userId())) {
            throw ApiException.notFound("Candidate");
        }
        return candidateView(c, a.user().userId(), privileged);
    }

    @Transactional
    public CandidateDtos.CandidateView updateProfile(Long candidateId, CandidateDtos.ProfileRequest request) {
        Candidate c = ownCandidate(candidateId);
        Election election = elections.findById(c.getElectionId()).orElseThrow();
        stateMachine.require(state(election).allowsManifestoEdits(), election, "edit candidate profiles");
        c.updateProfile(request.displayName().trim(), request.qualifications(), request.achievements(), clock.instant());
        c.updateBackground(request.education(), request.experience());
        return candidateView(c, c.getUserId(), false);
    }

    @Transactional
    public CandidateDtos.ManifestoView editManifesto(Long candidateId, CandidateDtos.ManifestoRequest request) {
        Candidate c = ownCandidate(candidateId);
        Manifesto m = manifestos.findByCandidateId(candidateId).orElseThrow();
        Election election = elections.findById(c.getElectionId()).orElseThrow();
        // The entity refuses edits once frozen; the state check covers elections past VOTING as well.
        m.edit(request.vision(), request.mission(), request.goals(), request.schemes(), request.initiatives(),
                clock.instant());
        stateMachine.require(state(election).allowsManifestoEdits(), election, "edit manifestos");
        return CandidateDtos.ManifestoView.of(m);
    }

    @Transactional
    public CandidateDtos.ManifestoView publishManifesto(Long candidateId) {
        Candidate c = ownCandidate(candidateId);
        Manifesto m = manifestos.findByCandidateId(candidateId).orElseThrow();
        Election election = elections.findById(c.getElectionId()).orElseThrow();
        m.publish(clock.instant());
        stateMachine.require(state(election).allowsManifestoEdits(), election, "publish manifestos");
        audit.record(AuditEventType.MANIFESTO_PUBLISHED, election.getOrganizationId(), election.getId(),
                c.getUserId(), Map.of("candidateId", candidateId));
        return CandidateDtos.ManifestoView.of(m);
    }

    // ------------------------------------------------------------------ media

    @Transactional
    public CandidateDtos.MediaView upload(Long candidateId, CandidateMedia.Type type, MultipartFile file) {
        Candidate c = ownCandidate(candidateId);
        Election election = elections.findById(c.getElectionId()).orElseThrow();
        stateMachine.require(state(election).allowsManifestoEdits(), election, "upload campaign media");
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("UPLOAD_FAILED", "Could not read the uploaded file");
        }
        ValidatingMediaStorage.Kind kind = switch (type) {
            case PHOTO, POSTER -> ValidatingMediaStorage.Kind.IMAGE;
            case MANIFESTO_PDF, SUPPORTING_DOCUMENT -> ValidatingMediaStorage.Kind.PDF;
            case VIDEO -> ValidatingMediaStorage.Kind.VIDEO;
        };
        String contentType;
        try {
            contentType = storage.validate(kind, file.getContentType(), bytes);
        } catch (ApiException e) {
            securityEvents.record(election.getOrganizationId(), SecurityEvent.Type.UPLOAD_REJECTED,
                    SecurityEvent.Severity.MEDIUM, "user:" + c.getUserId(), "Rejected upload: " + e.getMessage());
            throw e;
        }
        String extension = switch (contentType) {
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            case "application/pdf" -> ".pdf";
            default -> ".mp4";
        };
        String key = "elections/" + election.getId() + "/candidates/" + candidateId + "/"
                + SecureTokens.randomBase32(20) + extension;
        MediaStorage.StoredObject stored = storage.store(key, bytes, contentType);
        Instant now = clock.instant();
        CandidateMedia saved = media.save(new CandidateMedia(candidateId, type, stored.provider(), stored.key(),
                sanitizeFilename(file.getOriginalFilename(), extension), contentType, stored.size(), stored.sha256(), now));
        if (type == CandidateMedia.Type.PHOTO) {
            c.setPhoto(saved.getId(), now);
        }
        audit.record(AuditEventType.MEDIA_UPLOADED, election.getOrganizationId(), election.getId(), c.getUserId(),
                Map.of("candidateId", candidateId, "mediaType", type.name(), "sha256", stored.sha256()));
        return CandidateDtos.MediaView.of(saved);
    }

    /** Removes one of the candidate's own files while the campaign is still editable (the stored object is kept). */
    @Transactional
    public void deleteMedia(Long mediaId) {
        CandidateMedia m = media.findById(mediaId).orElseThrow(() -> ApiException.notFound("Media"));
        Candidate c = ownCandidate(m.getCandidateId());
        Election election = elections.findById(c.getElectionId()).orElseThrow();
        stateMachine.require(state(election).allowsManifestoEdits(), election, "remove campaign media");
        if (m.getId().equals(c.getPhotoMediaId())) {
            c.setPhoto(null, clock.instant());
        }
        media.delete(m);
        audit.record(AuditEventType.MEDIA_REMOVED, election.getOrganizationId(), election.getId(), c.getUserId(),
                Map.of("candidateId", c.getId(), "mediaType", m.getMediaType().name(), "sha256", m.getSha256()));
    }

    public record MediaContent(String filename, String contentType, byte[] bytes) {
    }

    @Transactional(readOnly = true)
    public MediaContent download(Long mediaId) {
        CandidateMedia m = media.findById(mediaId).orElseThrow(() -> ApiException.notFound("Media"));
        Candidate c = candidates.findById(m.getCandidateId()).orElseThrow();
        access.viewElection(c.getElectionId());
        return new MediaContent(m.getOriginalFilename(), m.getContentType(), storage.load(m.getStorageKey()));
    }

    // ------------------------------------------------------------------ helpers

    private CandidateApplication ownApplication(Long applicationId) {
        Long me = access.currentAccount().getId();
        return applications.findById(applicationId)
                .filter(a -> a.getUserId().equals(me))
                .orElseThrow(() -> ApiException.notFound("Application"));
    }

    private Candidate ownCandidate(Long candidateId) {
        Long me = access.currentAccount().getId();
        Candidate c = candidates.findById(candidateId).orElseThrow(() -> ApiException.notFound("Candidate"));
        User user = access.userInOrganization(elections.findById(c.getElectionId()).orElseThrow().getOrganizationId());
        if (!c.getUserId().equals(me) || !user.can(Permission.APPLY_AS_CANDIDATE)) {
            throw ApiException.forbidden("Only the candidate can change this profile");
        }
        if (!c.isActive()) {
            throw ApiException.conflict("CANDIDATE_WITHDRAWN", "This candidature was withdrawn");
        }
        return c;
    }

    private ElectionState state(Election election) {
        return stateMachine.stateOf(election);
    }

    private CandidateDtos.CandidateView candidateView(Candidate c, Long viewerId, boolean privileged) {
        boolean mine = c.getUserId().equals(viewerId);
        CandidateDtos.ManifestoView manifesto = manifestos.findByCandidateId(c.getId())
                .filter(m -> mine || privileged || m.getStatus() == Manifesto.Status.PUBLISHED)
                .map(CandidateDtos.ManifestoView::of)
                .orElse(null);
        List<CandidateDtos.MediaView> mediaViews = media.findByCandidateIdOrderByUploadedAtDesc(c.getId()).stream()
                .map(CandidateDtos.MediaView::of).toList();
        return new CandidateDtos.CandidateView(c.getId(), c.getElectionId(), c.getDisplayName(), c.getQualifications(),
                c.getAchievements(), c.getEducation(), c.getExperience(), c.getBallotPosition(), c.getStatus().name(),
                c.getPhotoMediaId() == null ? null : "/api/media/" + c.getPhotoMediaId(), mine, manifesto, mediaViews);
    }

    private CandidateDtos.ApplicationView applicationView(CandidateApplication a) {
        UserAccount applicant = users.findById(a.getUserId()).orElseThrow();
        Election election = elections.findById(a.getElectionId()).orElseThrow();
        Long candidateId = candidates.findByApplicationId(a.getId()).map(Candidate::getId).orElse(null);
        return new CandidateDtos.ApplicationView(a.getId(), a.getElectionId(), election.getTitle(),
                applicant.getFullName(), applicant.getEmail(), a.getDisplayName(), a.getStatement(),
                a.getQualifications(), a.getAchievements(), a.getStatus().name(), a.getReviewerNote(),
                a.getSubmittedAt(), a.getReviewedAt(), candidateId, a.getUserId(), a.getEducation(), a.getExperience());
    }

    private static String sanitizeFilename(String original, String extension) {
        String base = original == null ? "file" : original.replaceAll("[^A-Za-z0-9._ -]", "_");
        base = base.length() > 100 ? base.substring(0, 100) : base;
        return base.toLowerCase().endsWith(extension) ? base : base + extension;
    }
}
