-- DIGI-VOTE V11: admin-initiated password recovery. An organization owner generates a one-time code for a member;
-- the member redeems it on the public "Reset password" page. Only a hash of the code is stored.
CREATE TABLE password_recovery_codes (
    id              BIGINT      NOT NULL AUTO_INCREMENT,
    user_id         BIGINT      NOT NULL,
    organization_id BIGINT      NOT NULL,
    code_hash       CHAR(64)    NOT NULL,
    expires_at      DATETIME(3) NOT NULL,
    used_at         DATETIME(3) NULL,
    created_by      BIGINT      NOT NULL,
    created_at      DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_recovery_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT fk_recovery_creator FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT uq_recovery_code UNIQUE (code_hash)
) ENGINE = InnoDB;
CREATE INDEX ix_recovery_user ON password_recovery_codes (user_id, used_at);
