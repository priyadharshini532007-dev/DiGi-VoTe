-- DIGI-VOTE V8: voter self sign-up. Personal and identity details live in their own table, apart from the login
-- account. The ID number is stored sealed (AES-256-GCM under the server master key); a keyed hash makes "this ID is
-- already registered" checkable without keeping the number in clear. The proof scan is encrypted before it reaches
-- the media storage provider and is never returned by any endpoint.
CREATE TABLE identity_profiles (
    user_id            BIGINT       NOT NULL,
    gender             VARCHAR(24)  NOT NULL,
    date_of_birth      DATE         NOT NULL,
    father_name        VARCHAR(80)  NOT NULL,
    mother_name        VARCHAR(80)  NOT NULL,
    address            VARCHAR(300) NOT NULL,
    id_type            VARCHAR(16)  NOT NULL,
    id_number_sealed   VARCHAR(255) NOT NULL,
    id_number_hash     CHAR(64)     NOT NULL,
    id_last4           VARCHAR(4)   NOT NULL,
    proof_key          VARCHAR(255) NOT NULL,
    proof_content_type VARCHAR(32)  NOT NULL,
    proof_size         INT          NOT NULL,
    proof_sha256       CHAR(64)     NOT NULL,
    created_at         DATETIME(3)  NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_identity_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT uq_identity_id_hash UNIQUE (id_number_hash),
    CONSTRAINT ck_identity_gender CHECK (gender IN ('Female', 'Male', 'Other', 'Prefer not to say')),
    CONSTRAINT ck_identity_type CHECK (id_type IN ('VOTER_ID', 'AADHAAR')),
    CONSTRAINT ck_identity_proof_type CHECK (proof_content_type IN ('image/png', 'image/jpeg', 'application/pdf'))
) ENGINE = InnoDB;
