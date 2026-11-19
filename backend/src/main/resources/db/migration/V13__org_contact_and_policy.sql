-- DIGI-VOTE V13: organization contact details and a fuller security policy.
-- Lockout length, session length and the mixed-case password rule become per-organization settings. Existing
-- organizations keep today's behaviour (15 min lockout, 120 min sessions, letters + digits only).
ALTER TABLE organizations
    ADD COLUMN contact_email      VARCHAR(254) NULL AFTER description,
    ADD COLUMN phone              VARCHAR(30)  NULL AFTER contact_email,
    ADD COLUMN tagline            VARCHAR(160) NULL AFTER phone,
    ADD COLUMN lockout_minutes    INT          NOT NULL DEFAULT 15,
    ADD COLUMN session_minutes    INT          NOT NULL DEFAULT 120,
    ADD COLUMN require_mixed_case BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT ck_organizations_lockout CHECK (lockout_minutes BETWEEN 5 AND 120),
    ADD CONSTRAINT ck_organizations_session CHECK (session_minutes BETWEEN 15 AND 480);
