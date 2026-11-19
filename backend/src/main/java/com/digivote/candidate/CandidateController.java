package com.digivote.candidate;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ContentDisposition;
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
@Tag(name = "Candidates, applications and manifestos")
public class CandidateController {

    private final CandidateService service;

    public CandidateController(CandidateService service) {
        this.service = service;
    }

    @PostMapping("/elections/{electionId}/applications")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Apply to contest an election (candidate)")
    public CandidateDtos.ApplicationView apply(@PathVariable Long electionId,
                                               @Valid @RequestBody CandidateDtos.ApplicationRequest request) {
        return service.apply(electionId, request);
    }

    @GetMapping("/elections/{electionId}/applications")
    @Operation(summary = "All applications for an election (operators and auditors)")
    public List<CandidateDtos.ApplicationView> applications(@PathVariable Long electionId) {
        return service.applicationsFor(electionId);
    }

    @GetMapping("/me/applications")
    public List<CandidateDtos.ApplicationView> myApplications() {
        return service.myApplications();
    }

    @PutMapping("/applications/{applicationId}")
    @Operation(summary = "Revise an application (after a correction request)")
    public CandidateDtos.ApplicationView revise(@PathVariable Long applicationId,
                                                @Valid @RequestBody CandidateDtos.ApplicationRequest request) {
        return service.revise(applicationId, request);
    }

    @PostMapping("/applications/{applicationId}/review")
    @Operation(summary = "Approve, reject or request corrections (election operator)")
    public CandidateDtos.ApplicationView review(@PathVariable Long applicationId,
                                                @Valid @RequestBody CandidateDtos.ReviewRequest request) {
        return service.review(applicationId, request);
    }

    @PostMapping("/applications/{applicationId}/withdraw")
    @Operation(summary = "Withdraw candidature before the configured deadline")
    public CandidateDtos.ApplicationView withdraw(@PathVariable Long applicationId) {
        return service.withdraw(applicationId);
    }

    @GetMapping("/elections/{electionId}/candidates")
    public List<CandidateDtos.CandidateView> candidates(@PathVariable Long electionId) {
        return service.candidatesFor(electionId);
    }

    @GetMapping("/candidates/{candidateId}")
    public CandidateDtos.CandidateView candidate(@PathVariable Long candidateId) {
        return service.candidate(candidateId);
    }

    @PutMapping("/candidates/{candidateId}/profile")
    public CandidateDtos.CandidateView profile(@PathVariable Long candidateId,
                                               @Valid @RequestBody CandidateDtos.ProfileRequest request) {
        return service.updateProfile(candidateId, request);
    }

    @PutMapping("/candidates/{candidateId}/manifesto")
    @Operation(summary = "Edit the manifesto (rejected once frozen)")
    public CandidateDtos.ManifestoView manifesto(@PathVariable Long candidateId,
                                                 @Valid @RequestBody CandidateDtos.ManifestoRequest request) {
        return service.editManifesto(candidateId, request);
    }

    @PostMapping("/candidates/{candidateId}/manifesto/publish")
    public CandidateDtos.ManifestoView publishManifesto(@PathVariable Long candidateId) {
        return service.publishManifesto(candidateId);
    }

    @PostMapping(value = "/candidates/{candidateId}/media", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Upload a photo (PNG/JPEG), manifesto PDF, poster or MP4 video")
    public CandidateDtos.MediaView upload(@PathVariable Long candidateId,
                                          @RequestParam CandidateMedia.Type type,
                                          @RequestPart("file") MultipartFile file) {
        return service.upload(candidateId, type, file);
    }

    @DeleteMapping("/media/{mediaId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove one of your own campaign files (while the campaign is editable)")
    public void deleteMedia(@PathVariable Long mediaId) {
        service.deleteMedia(mediaId);
    }

    @GetMapping("/media/{mediaId}")
    public ResponseEntity<byte[]> media(@PathVariable Long mediaId) {
        CandidateService.MediaContent content = service.download(mediaId);
        boolean inline = content.contentType().startsWith("image/");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(content.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, (inline ? ContentDisposition.inline()
                        : ContentDisposition.attachment()).filename(content.filename()).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(content.bytes());
    }
}
