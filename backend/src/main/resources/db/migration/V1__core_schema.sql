-- DIGI-VOTE core schema (MySQL 8+). Normalized to 3NF.
-- Identity-side tables: users, organization_memberships, eligible_voters, voting_credentials.
-- Anonymous-side tables: voting_tokens, ballots, votes, verification_receipts, bulletin_board_entries.
-- No anonymous-side table carries a user id, email, or any reversible identity reference.

CREATE TABLE roles (
    code          VARCHAR(32)  NOT NULL,
    name          VARCHAR(64)  NOT NULL,
    description   VARCHAR(255) NOT NULL,
    PRIMARY KEY (code)
) ENGINE = InnoDB;

CREATE TABLE organizations (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    name                 VARCHAR(120) NOT NULL,
    slug                 VARCHAR(80)  NOT NULL,
    description          VARCHAR(1000),
    logo_url             VARCHAR(500),
    primary_color        VARCHAR(7)   NOT NULL DEFAULT '#1e3a8a',
    status               VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    password_min_length  INT          NOT NULL DEFAULT 10,
    max_failed_logins    INT          NOT NULL DEFAULT 5,
    created_at           DATETIME(3)  NOT NULL,
    updated_at           DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_organizations_slug UNIQUE (slug),
    CONSTRAINT ck_organizations_status CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    CONSTRAINT ck_organizations_color CHECK (primary_color REGEXP '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT ck_organizations_pwlen CHECK (password_min_length BETWEEN 8 AND 128),
    CONSTRAINT ck_organizations_maxfail CHECK (max_failed_logins BETWEEN 3 AND 20)
) ENGINE = InnoDB;

CREATE TABLE users (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    email               VARCHAR(254) NOT NULL,
    full_name           VARCHAR(120) NOT NULL,
    mobile_number       VARCHAR(20),
    password_hash       VARCHAR(100),
    firebase_uid        VARCHAR(128),
    status              VARCHAR(24)  NOT NULL,
    failed_login_count  INT          NOT NULL DEFAULT 0,
    locked_until        DATETIME(3),
    last_login_at       DATETIME(3),
    created_at          DATETIME(3)  NOT NULL,
    updated_at          DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_firebase UNIQUE (firebase_uid),
    CONSTRAINT ck_users_status CHECK (status IN ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED')),
    CONSTRAINT ck_users_failed CHECK (failed_login_count >= 0)
) ENGINE = InnoDB;

CREATE TABLE organization_memberships (
    id                     BIGINT      NOT NULL AUTO_INCREMENT,
    organization_id        BIGINT      NOT NULL,
    user_id                BIGINT      NOT NULL,
    role_code              VARCHAR(32) NOT NULL,
    status                 VARCHAR(16) NOT NULL,
    activation_code_hash   CHAR(64),
    activation_expires_at  DATETIME(3),
    invited_by             BIGINT,
    created_at             DATETIME(3) NOT NULL,
    updated_at             DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_membership_org_user UNIQUE (organization_id, user_id),
    CONSTRAINT fk_membership_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE RESTRICT,
    CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_membership_role FOREIGN KEY (role_code) REFERENCES roles (code),
    CONSTRAINT fk_membership_inviter FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT ck_membership_status CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'))
) ENGINE = InnoDB;
CREATE INDEX ix_membership_user ON organization_memberships (user_id);
CREATE INDEX ix_membership_org_role ON organization_memberships (organization_id, role_code, status);

CREATE TABLE elections (
    id               BIGINT        NOT NULL AUTO_INCREMENT,
    organization_id  BIGINT        NOT NULL,
    title            VARCHAR(160)  NOT NULL,
    description      VARCHAR(2000),
    status           VARCHAR(16)   NOT NULL,
    created_by       BIGINT        NOT NULL,
    created_at       DATETIME(3)   NOT NULL,
    updated_at       DATETIME(3)   NOT NULL,
    archived_at      DATETIME(3),
    version          BIGINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT fk_election_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE RESTRICT,
    CONSTRAINT fk_election_creator FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT ck_election_status CHECK (status IN
        ('DRAFT', 'REGISTRATION', 'CAMPAIGN', 'VOTING', 'VERIFICATION', 'PUBLISHED', 'ARCHIVED'))
) ENGINE = InnoDB;
CREATE INDEX ix_election_org_status ON elections (organization_id, status);

CREATE TABLE election_administrators (
    election_id  BIGINT      NOT NULL,
    user_id      BIGINT      NOT NULL,
    assigned_by  BIGINT      NOT NULL,
    assigned_at  DATETIME(3) NOT NULL,
    PRIMARY KEY (election_id, user_id),
    CONSTRAINT fk_eadmin_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT fk_eadmin_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_eadmin_assigner FOREIGN KEY (assigned_by) REFERENCES users (id)
) ENGINE = InnoDB;
CREATE INDEX ix_eadmin_user ON election_administrators (user_id);

CREATE TABLE election_rules (
    election_id                BIGINT      NOT NULL,
    max_selections             INT         NOT NULL DEFAULT 1,
    counting_method            VARCHAR(16) NOT NULL DEFAULT 'PLURALITY',
    require_candidate_approval BOOLEAN     NOT NULL DEFAULT TRUE,
    anonymous_voting           BOOLEAN     NOT NULL DEFAULT TRUE,
    public_results             BOOLEAN     NOT NULL DEFAULT TRUE,
    qr_receipts                BOOLEAN     NOT NULL DEFAULT TRUE,
    receipts_required          BOOLEAN     NOT NULL DEFAULT TRUE,
    nota_enabled               BOOLEAN     NOT NULL DEFAULT FALSE,
    candidates_may_vote        BOOLEAN     NOT NULL DEFAULT TRUE,
    administrators_may_vote    BOOLEAN     NOT NULL DEFAULT FALSE,
    result_publication_policy  VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
    min_candidates             INT         NOT NULL DEFAULT 2,
    campaign_start             DATETIME(3),
    campaign_end               DATETIME(3),
    voting_start               DATETIME(3),
    voting_end                 DATETIME(3),
    withdrawal_deadline        DATETIME(3),
    updated_at                 DATETIME(3) NOT NULL,
    PRIMARY KEY (election_id),
    CONSTRAINT fk_rules_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT ck_rules_maxsel CHECK (max_selections BETWEEN 1 AND 50),
    CONSTRAINT ck_rules_mincand CHECK (min_candidates BETWEEN 1 AND 100),
    CONSTRAINT ck_rules_method CHECK (counting_method IN ('PLURALITY', 'APPROVAL')),
    CONSTRAINT ck_rules_policy CHECK (result_publication_policy IN ('MANUAL', 'AFTER_VERIFICATION')),
    CONSTRAINT ck_rules_voting_window CHECK (voting_start IS NULL OR voting_end IS NULL OR voting_end > voting_start),
    CONSTRAINT ck_rules_campaign_window CHECK (campaign_start IS NULL OR campaign_end IS NULL OR campaign_end >= campaign_start)
) ENGINE = InnoDB;

CREATE TABLE election_state_transitions (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    election_id    BIGINT       NOT NULL,
    from_status    VARCHAR(16),
    to_status      VARCHAR(16)  NOT NULL,
    actor_user_id  BIGINT,
    note           VARCHAR(500),
    occurred_at    DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_transition_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT fk_transition_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
) ENGINE = InnoDB;
CREATE INDEX ix_transition_election ON election_state_transitions (election_id, occurred_at);

CREATE TABLE candidate_applications (
    id               BIGINT        NOT NULL AUTO_INCREMENT,
    election_id      BIGINT        NOT NULL,
    user_id          BIGINT        NOT NULL,
    display_name     VARCHAR(120)  NOT NULL,
    statement        VARCHAR(2000) NOT NULL,
    qualifications   VARCHAR(2000),
    achievements     VARCHAR(2000),
    status           VARCHAR(24)   NOT NULL,
    reviewer_note    VARCHAR(1000),
    reviewed_by      BIGINT,
    submitted_at     DATETIME(3)   NOT NULL,
    reviewed_at      DATETIME(3),
    updated_at       DATETIME(3)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_application_election_user UNIQUE (election_id, user_id),
    CONSTRAINT fk_application_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT fk_application_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_application_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id),
    CONSTRAINT ck_application_status CHECK (status IN
        ('SUBMITTED', 'CORRECTION_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'))
) ENGINE = InnoDB;
CREATE INDEX ix_application_election_status ON candidate_applications (election_id, status);

CREATE TABLE candidates (
    id               BIGINT        NOT NULL AUTO_INCREMENT,
    election_id      BIGINT        NOT NULL,
    application_id   BIGINT        NOT NULL,
    user_id          BIGINT        NOT NULL,
    display_name     VARCHAR(120)  NOT NULL,
    qualifications   VARCHAR(2000),
    achievements     VARCHAR(2000),
    photo_media_id   BIGINT,
    ballot_position  INT           NOT NULL,
    status           VARCHAR(16)   NOT NULL,
    created_at       DATETIME(3)   NOT NULL,
    updated_at       DATETIME(3)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_candidate_application UNIQUE (application_id),
    CONSTRAINT uq_candidate_election_user UNIQUE (election_id, user_id),
    CONSTRAINT uq_candidate_position UNIQUE (election_id, ballot_position),
    CONSTRAINT fk_candidate_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT fk_candidate_application FOREIGN KEY (application_id) REFERENCES candidate_applications (id),
    CONSTRAINT fk_candidate_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_candidate_status CHECK (status IN ('ACTIVE', 'WITHDRAWN')),
    CONSTRAINT ck_candidate_position CHECK (ballot_position >= 1)
) ENGINE = InnoDB;

CREATE TABLE manifestos (
    id            BIGINT        NOT NULL AUTO_INCREMENT,
    candidate_id  BIGINT        NOT NULL,
    vision        VARCHAR(4000),
    mission       VARCHAR(4000),
    goals         VARCHAR(4000),
    schemes       VARCHAR(4000),
    status        VARCHAR(16)   NOT NULL,
    frozen        BOOLEAN       NOT NULL DEFAULT FALSE,
    frozen_at     DATETIME(3),
    published_at  DATETIME(3),
    updated_at    DATETIME(3)   NOT NULL,
    version       BIGINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT uq_manifesto_candidate UNIQUE (candidate_id),
    CONSTRAINT fk_manifesto_candidate FOREIGN KEY (candidate_id) REFERENCES candidates (id) ON DELETE RESTRICT,
    CONSTRAINT ck_manifesto_status CHECK (status IN ('DRAFT', 'PUBLISHED'))
) ENGINE = InnoDB;

CREATE TABLE candidate_media (
    id                 BIGINT       NOT NULL AUTO_INCREMENT,
    candidate_id       BIGINT       NOT NULL,
    media_type         VARCHAR(20)  NOT NULL,
    storage_provider   VARCHAR(16)  NOT NULL,
    storage_key        VARCHAR(500) NOT NULL,
    original_filename  VARCHAR(255) NOT NULL,
    content_type       VARCHAR(100) NOT NULL,
    size_bytes         BIGINT       NOT NULL,
    sha256             CHAR(64)     NOT NULL,
    uploaded_at        DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_media_candidate FOREIGN KEY (candidate_id) REFERENCES candidates (id) ON DELETE RESTRICT,
    CONSTRAINT ck_media_type CHECK (media_type IN ('PHOTO', 'MANIFESTO_PDF', 'POSTER', 'VIDEO')),
    CONSTRAINT ck_media_provider CHECK (storage_provider IN ('LOCAL', 'FIREBASE')),
    CONSTRAINT ck_media_size CHECK (size_bytes > 0)
) ENGINE = InnoDB;
CREATE INDEX ix_media_candidate ON candidate_media (candidate_id);

ALTER TABLE candidates
    ADD CONSTRAINT fk_candidate_photo FOREIGN KEY (photo_media_id) REFERENCES candidate_media (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- identity side of voting

CREATE TABLE eligible_voters (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    election_id  BIGINT      NOT NULL,
    user_id      BIGINT      NOT NULL,
    status       VARCHAR(16) NOT NULL,
    added_by     BIGINT      NOT NULL,
    added_at     DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_eligible_election_user UNIQUE (election_id, user_id),
    CONSTRAINT fk_eligible_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT fk_eligible_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_eligible_added_by FOREIGN KEY (added_by) REFERENCES users (id),
    CONSTRAINT ck_eligible_status CHECK (status IN ('ELIGIBLE', 'REMOVED'))
) ENGINE = InnoDB;
CREATE INDEX ix_eligible_user ON eligible_voters (user_id);

-- One blind-signed credential per eligible voter. The server stores only the hash of the
-- *blinded* request it signed; it never sees the unblinded token that is later spent.
CREATE TABLE voting_credentials (
    id                     BIGINT      NOT NULL AUTO_INCREMENT,
    eligible_voter_id      BIGINT      NOT NULL,
    election_id            BIGINT      NOT NULL,
    blinded_request_hash   CHAR(64)    NOT NULL,
    blind_signature        TEXT        NOT NULL,
    key_fingerprint        CHAR(64)    NOT NULL,
    issued_at              DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_credential_voter UNIQUE (eligible_voter_id),
    CONSTRAINT fk_credential_voter FOREIGN KEY (eligible_voter_id) REFERENCES eligible_voters (id) ON DELETE RESTRICT,
    CONSTRAINT fk_credential_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT
) ENGINE = InnoDB;
CREATE INDEX ix_credential_election ON voting_credentials (election_id);

-- Per-election key material. Private keys are AES-GCM encrypted with the server master key.
CREATE TABLE election_keys (
    election_id           BIGINT      NOT NULL,
    rsa_modulus           TEXT        NOT NULL,
    rsa_public_exponent   VARCHAR(16) NOT NULL,
    rsa_private_enc       TEXT        NOT NULL,
    rsa_fingerprint       CHAR(64)    NOT NULL,
    paillier_n            TEXT        NOT NULL,
    paillier_private_enc  TEXT        NOT NULL,
    created_at            DATETIME(3) NOT NULL,
    PRIMARY KEY (election_id),
    CONSTRAINT fk_keys_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT
) ENGINE = InnoDB;

-- ---------------------------------------------------------------- anonymous side of voting

CREATE TABLE ballots (
    id                  BIGINT      NOT NULL AUTO_INCREMENT,
    election_id         BIGINT      NOT NULL,
    ballot_commitment   CHAR(64)    NOT NULL,
    selection_count     INT         NOT NULL,
    accepted_at_minute  DATETIME    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_ballot_commitment UNIQUE (ballot_commitment),
    CONSTRAINT fk_ballot_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT ck_ballot_selections CHECK (selection_count >= 1)
) ENGINE = InnoDB;
CREATE INDEX ix_ballot_election ON ballots (election_id);

-- One row per ballot option: Paillier ciphertext of 1 (selected) or 0 (not selected).
CREATE TABLE votes (
    id            BIGINT  NOT NULL AUTO_INCREMENT,
    ballot_id     BIGINT  NOT NULL,
    option_index  INT     NOT NULL,
    ciphertext    TEXT    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_vote_ballot_option UNIQUE (ballot_id, option_index),
    CONSTRAINT fk_vote_ballot FOREIGN KEY (ballot_id) REFERENCES ballots (id) ON DELETE RESTRICT,
    CONSTRAINT ck_vote_option CHECK (option_index >= 0)
) ENGINE = InnoDB;

-- Spent anonymous tokens. UNIQUE(election_id, token_hash) is the database-level one-vote guarantee.
CREATE TABLE voting_tokens (
    id                     BIGINT      NOT NULL AUTO_INCREMENT,
    election_id            BIGINT      NOT NULL,
    token_hash             CHAR(64)    NOT NULL,
    submission_nonce_hash  CHAR(64)    NOT NULL,
    ballot_id              BIGINT      NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_token_election_hash UNIQUE (election_id, token_hash),
    CONSTRAINT uq_token_ballot UNIQUE (ballot_id),
    CONSTRAINT fk_token_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT fk_token_ballot FOREIGN KEY (ballot_id) REFERENCES ballots (id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE verification_receipts (
    id                  BIGINT      NOT NULL AUTO_INCREMENT,
    ballot_id           BIGINT      NOT NULL,
    election_id         BIGINT      NOT NULL,
    receipt_code_hash   CHAR(64)    NOT NULL,
    issued_at_minute    DATETIME    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_receipt_ballot UNIQUE (ballot_id),
    CONSTRAINT uq_receipt_code UNIQUE (receipt_code_hash),
    CONSTRAINT fk_receipt_ballot FOREIGN KEY (ballot_id) REFERENCES ballots (id) ON DELETE RESTRICT,
    CONSTRAINT fk_receipt_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE bulletin_board_entries (
    id                 BIGINT      NOT NULL AUTO_INCREMENT,
    election_id        BIGINT      NOT NULL,
    seq                INT         NOT NULL,
    ballot_id          BIGINT      NOT NULL,
    ballot_commitment  CHAR(64)    NOT NULL,
    prev_hash          CHAR(64)    NOT NULL,
    entry_hash         CHAR(64)    NOT NULL,
    posted_at_minute   DATETIME    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_bulletin_seq UNIQUE (election_id, seq),
    CONSTRAINT uq_bulletin_ballot UNIQUE (ballot_id),
    CONSTRAINT fk_bulletin_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT fk_bulletin_ballot FOREIGN KEY (ballot_id) REFERENCES ballots (id) ON DELETE RESTRICT,
    CONSTRAINT ck_bulletin_seq CHECK (seq >= 1)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------- results

CREATE TABLE election_results (
    id                   BIGINT      NOT NULL AUTO_INCREMENT,
    election_id          BIGINT      NOT NULL,
    status               VARCHAR(16) NOT NULL,
    counting_method      VARCHAR(16) NOT NULL,
    accepted_ballots     INT         NOT NULL,
    total_selections     INT         NOT NULL,
    bulletin_head_hash   CHAR(64)    NOT NULL,
    tie_detected         BOOLEAN     NOT NULL DEFAULT FALSE,
    result_hash          CHAR(64)    NOT NULL,
    generated_by         BIGINT      NOT NULL,
    generated_at         DATETIME(3) NOT NULL,
    generation_count     INT         NOT NULL DEFAULT 1,
    published_by         BIGINT,
    published_at         DATETIME(3),
    PRIMARY KEY (id),
    CONSTRAINT uq_result_election UNIQUE (election_id),
    CONSTRAINT fk_result_election FOREIGN KEY (election_id) REFERENCES elections (id) ON DELETE RESTRICT,
    CONSTRAINT fk_result_generator FOREIGN KEY (generated_by) REFERENCES users (id),
    CONSTRAINT fk_result_publisher FOREIGN KEY (published_by) REFERENCES users (id),
    CONSTRAINT ck_result_status CHECK (status IN ('GENERATED', 'PUBLISHED')),
    CONSTRAINT ck_result_counts CHECK (accepted_ballots >= 0 AND total_selections >= 0)
) ENGINE = InnoDB;

CREATE TABLE election_result_items (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    result_id             BIGINT       NOT NULL,
    option_index          INT          NOT NULL,
    candidate_id          BIGINT,
    label                 VARCHAR(120) NOT NULL,
    votes                 INT          NOT NULL,
    result_rank           INT          NOT NULL,
    winner                BOOLEAN      NOT NULL DEFAULT FALSE,
    aggregate_ciphertext  TEXT         NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_result_item_option UNIQUE (result_id, option_index),
    CONSTRAINT fk_result_item_result FOREIGN KEY (result_id) REFERENCES election_results (id) ON DELETE RESTRICT,
    CONSTRAINT fk_result_item_candidate FOREIGN KEY (candidate_id) REFERENCES candidates (id),
    CONSTRAINT ck_result_item_votes CHECK (votes >= 0)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------- audit, security, notifications, reports

CREATE TABLE audit_chain_heads (
    chain_key  VARCHAR(40) NOT NULL,
    last_seq   BIGINT      NOT NULL,
    last_hash  CHAR(64)    NOT NULL,
    PRIMARY KEY (chain_key)
) ENGINE = InnoDB;

CREATE TABLE audit_logs (
    id               BIGINT        NOT NULL AUTO_INCREMENT,
    chain_key        VARCHAR(40)   NOT NULL,
    seq              BIGINT        NOT NULL,
    event_id         CHAR(36)      NOT NULL,
    event_type       VARCHAR(48)   NOT NULL,
    occurred_at      DATETIME(3)   NOT NULL,
    organization_id  BIGINT,
    election_id      BIGINT,
    actor_ref        VARCHAR(64),
    metadata_json    VARCHAR(4000) NOT NULL,
    prev_hash        CHAR(64)      NOT NULL,
    record_hash      CHAR(64)      NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_audit_chain_seq UNIQUE (chain_key, seq),
    CONSTRAINT uq_audit_event UNIQUE (event_id),
    CONSTRAINT ck_audit_seq CHECK (seq >= 1)
) ENGINE = InnoDB;
CREATE INDEX ix_audit_org_time ON audit_logs (organization_id, occurred_at);
CREATE INDEX ix_audit_election ON audit_logs (election_id, seq);
CREATE INDEX ix_audit_type ON audit_logs (event_type);

CREATE TABLE security_events (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    organization_id  BIGINT,
    event_type       VARCHAR(40)  NOT NULL,
    severity         VARCHAR(8)   NOT NULL,
    principal_ref    VARCHAR(64),
    detail           VARCHAR(500) NOT NULL,
    occurred_at      DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_secevent_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT ck_secevent_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH'))
) ENGINE = InnoDB;
CREATE INDEX ix_secevent_org_time ON security_events (organization_id, occurred_at);
CREATE INDEX ix_secevent_type ON security_events (event_type);

CREATE TABLE notifications (
    id               BIGINT        NOT NULL AUTO_INCREMENT,
    user_id          BIGINT        NOT NULL,
    organization_id  BIGINT,
    election_id      BIGINT,
    type             VARCHAR(40)   NOT NULL,
    title            VARCHAR(160)  NOT NULL,
    body             VARCHAR(1000) NOT NULL,
    read_at          DATETIME(3),
    created_at       DATETIME(3)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_notification_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT fk_notification_election FOREIGN KEY (election_id) REFERENCES elections (id)
) ENGINE = InnoDB;
CREATE INDEX ix_notification_user ON notifications (user_id, read_at, created_at);

CREATE TABLE device_tokens (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    token       VARCHAR(255) NOT NULL,
    created_at  DATETIME(3)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_device_token UNIQUE (token),
    CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB;

CREATE TABLE reports (
    id               BIGINT      NOT NULL AUTO_INCREMENT,
    organization_id  BIGINT      NOT NULL,
    election_id      BIGINT,
    report_type      VARCHAR(20) NOT NULL,
    generated_by     BIGINT      NOT NULL,
    generated_at     DATETIME(3) NOT NULL,
    content_json     MEDIUMTEXT  NOT NULL,
    content_hash     CHAR(64)    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_report_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT fk_report_election FOREIGN KEY (election_id) REFERENCES elections (id),
    CONSTRAINT fk_report_generator FOREIGN KEY (generated_by) REFERENCES users (id),
    CONSTRAINT ck_report_type CHECK (report_type IN ('ELECTION', 'AUDIT', 'SECURITY', 'PARTICIPATION', 'HEALTH'))
) ENGINE = InnoDB;
CREATE INDEX ix_report_org_time ON reports (organization_id, generated_at);
