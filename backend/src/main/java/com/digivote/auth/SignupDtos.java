package com.digivote.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public final class SignupDtos {

    private SignupDtos() {
    }

    /** Roles a person may choose for themselves. Everything else is granted by invitation. */
    public enum SignupRole { VOTER, CANDIDATE }

    public enum IdType { VOTER_ID, AADHAAR }

    private static final String NAME = "^[A-Za-z][A-Za-z .'-]{1,79}$";

    public record SignupRequest(
            @NotNull SignupRole role,
            @NotBlank @Pattern(regexp = NAME, message = "Enter your full name (letters only)") String fullName,
            @NotBlank @Pattern(regexp = "^(Female|Male|Other|Prefer not to say)$", message = "Select your gender") String gender,
            @NotNull LocalDate dateOfBirth,
            @NotBlank @Pattern(regexp = NAME, message = "Enter your father's name") String fatherName,
            @NotBlank @Pattern(regexp = NAME, message = "Enter your mother's name") String motherName,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 20) String mobileNumber,
            @NotBlank @Size(min = 10, max = 300, message = "Enter your full address") String address,
            @NotNull IdType idType,
            @NotBlank @Size(max = 20) String idNumber,
            @NotBlank @Size(max = 128) String password) {
    }
}
