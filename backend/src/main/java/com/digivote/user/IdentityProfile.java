package com.digivote.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

/** Personal and identity details collected at voter self sign-up. Sensitive: never serialized to the API. */
@Entity
@Table(name = "identity_profiles")
public class IdentityProfile {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false)
    private String gender;

    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    @Column(name = "father_name", nullable = false)
    private String fatherName;

    @Column(name = "mother_name", nullable = false)
    private String motherName;

    @Column(nullable = false)
    private String address;

    @Column(name = "id_type", nullable = false)
    private String idType;

    @Column(name = "id_number_sealed", nullable = false)
    private String idNumberSealed;

    @Column(name = "id_number_hash", nullable = false)
    private String idNumberHash;

    @Column(name = "id_last4", nullable = false)
    private String idLast4;

    @Column(name = "proof_key", nullable = false)
    private String proofKey;

    @Column(name = "proof_content_type", nullable = false)
    private String proofContentType;

    @Column(name = "proof_size", nullable = false)
    private int proofSize;

    @Column(name = "proof_sha256", nullable = false)
    private String proofSha256;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected IdentityProfile() {
    }

    public IdentityProfile(Long userId, String gender, LocalDate dateOfBirth, String fatherName, String motherName,
                           String address, String idType, String idNumberSealed, String idNumberHash, String idLast4,
                           String proofKey, String proofContentType, int proofSize, String proofSha256, Instant now) {
        this.userId = userId;
        this.gender = gender;
        this.dateOfBirth = dateOfBirth;
        this.fatherName = fatherName;
        this.motherName = motherName;
        this.address = address;
        this.idType = idType;
        this.idNumberSealed = idNumberSealed;
        this.idNumberHash = idNumberHash;
        this.idLast4 = idLast4;
        this.proofKey = proofKey;
        this.proofContentType = proofContentType;
        this.proofSize = proofSize;
        this.proofSha256 = proofSha256;
        this.createdAt = now;
    }

    public Long getUserId() {
        return userId;
    }

    public String getIdType() {
        return idType;
    }

    public String getIdLast4() {
        return idLast4;
    }
}
