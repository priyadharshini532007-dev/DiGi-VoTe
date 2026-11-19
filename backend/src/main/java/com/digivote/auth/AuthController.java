package com.digivote.auth;

import com.digivote.access.AccessControlService;
import com.digivote.config.DigiVoteProperties;
import com.digivote.firebase.FirebaseAuthGateway;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication")
public class AuthController {

    private final AuthService auth;
    private final AccessControlService access;
    private final FirebaseAuthGateway firebase;
    private final DigiVoteProperties properties;
    private final SignupService signups;

    public AuthController(AuthService auth, AccessControlService access, FirebaseAuthGateway firebase,
                          DigiVoteProperties properties, SignupService signups) {
        this.signups = signups;
        this.auth = auth;
        this.access = access;
        this.firebase = firebase;
        this.properties = properties;
    }

    @GetMapping("/config")
    @Operation(summary = "Which sign-in methods this server offers")
    public AuthDtos.AuthConfigResponse config() {
        return new AuthDtos.AuthConfigResponse(firebase.isEnabled(), properties.devMode());
    }

    @PostMapping("/register-organization")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create an organization and its owner account")
    public AuthDtos.SessionResponse register(@Valid @RequestBody AuthDtos.RegisterOrganizationRequest request) {
        return auth.registerOrganization(request);
    }

    @PostMapping(value = "/signup", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Voter self sign-up with identity details and an ID proof scan (when enabled on the server)")
    public AuthDtos.SessionResponse signup(@Valid @RequestPart("data") SignupDtos.SignupRequest data,
                                           @RequestPart("proof") MultipartFile proof) {
        return auth.sessionFor(signups.register(data, proof));
    }

    @PostMapping("/recover")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Set a new password with a one-time recovery code from an organization owner")
    public void recover(@Valid @RequestBody AuthDtos.RecoverRequest request) {
        auth.recover(request);
    }

    @PostMapping("/login")
    @Operation(summary = "Password login; returns a DIGI-VOTE session token")
    public AuthDtos.SessionResponse login(@Valid @RequestBody AuthDtos.LoginRequest request) {
        return auth.login(request);
    }

    @PostMapping("/activate")
    @Operation(summary = "Accept an invitation with its one-time activation code and set a password")
    public AuthDtos.SessionResponse activate(@Valid @RequestBody AuthDtos.ActivateRequest request) {
        return auth.activate(request);
    }

    @PostMapping("/firebase")
    @Operation(summary = "Exchange a verified Firebase ID token for a DIGI-VOTE session (links by verified email)")
    public AuthDtos.SessionResponse firebase(@Valid @RequestBody AuthDtos.FirebaseLoginRequest request) {
        return auth.firebaseLogin(request);
    }

    @PostMapping("/firebase/register-organization")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create an organization whose owner signs in with Firebase (verified email required)")
    public AuthDtos.SessionResponse firebaseRegister(@Valid @RequestBody AuthDtos.FirebaseRegisterOrganizationRequest request) {
        return auth.firebaseRegisterOrganization(request);
    }

    @PostMapping("/firebase/activate")
    @Operation(summary = "Accept an invitation with a Firebase sign-in whose verified email matches the invitation")
    public AuthDtos.SessionResponse firebaseActivate(@Valid @RequestBody AuthDtos.FirebaseActivateRequest request) {
        return auth.firebaseActivate(request);
    }

    @GetMapping("/me")
    @Operation(summary = "Current account and its organization memberships")
    public AuthDtos.MeResponse me() {
        return auth.me(access.currentAccount());
    }

    @PutMapping("/me")
    @Operation(summary = "Update own profile")
    public AuthDtos.MeResponse updateProfile(@Valid @RequestBody AuthDtos.UpdateProfileRequest request) {
        return auth.updateProfile(access.currentAccount(), request);
    }

    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@Valid @RequestBody AuthDtos.ChangePasswordRequest request) {
        auth.changePassword(access.currentAccount(), request);
    }
}
