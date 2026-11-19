package com.digivote.voting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/** Per-election public keys plus AES-GCM sealed private keys. Created once when voting opens. */
@Entity
@Immutable
@Table(name = "election_keys")
public class ElectionKeys {

    @Id
    @Column(name = "election_id")
    private Long electionId;

    @Column(name = "rsa_modulus", nullable = false)
    private String rsaModulus;

    @Column(name = "rsa_public_exponent", nullable = false)
    private String rsaPublicExponent;

    @Column(name = "rsa_private_enc", nullable = false)
    private String rsaPrivateSealed;

    @Column(name = "rsa_fingerprint", nullable = false)
    private String rsaFingerprint;

    @Column(name = "paillier_n", nullable = false)
    private String paillierN;

    @Column(name = "paillier_private_enc", nullable = false)
    private String paillierPrivateSealed;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ElectionKeys() {
    }

    public ElectionKeys(Long electionId, String rsaModulus, String rsaPublicExponent, String rsaPrivateSealed,
                        String rsaFingerprint, String paillierN, String paillierPrivateSealed, Instant createdAt) {
        this.electionId = electionId;
        this.rsaModulus = rsaModulus;
        this.rsaPublicExponent = rsaPublicExponent;
        this.rsaPrivateSealed = rsaPrivateSealed;
        this.rsaFingerprint = rsaFingerprint;
        this.paillierN = paillierN;
        this.paillierPrivateSealed = paillierPrivateSealed;
        this.createdAt = createdAt;
    }

    public Long getElectionId() {
        return electionId;
    }

    public String getRsaModulus() {
        return rsaModulus;
    }

    public String getRsaPublicExponent() {
        return rsaPublicExponent;
    }

    String getRsaPrivateSealed() {
        return rsaPrivateSealed;
    }

    public String getRsaFingerprint() {
        return rsaFingerprint;
    }

    public String getPaillierN() {
        return paillierN;
    }

    String getPaillierPrivateSealed() {
        return paillierPrivateSealed;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
