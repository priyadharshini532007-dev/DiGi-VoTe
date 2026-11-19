-- DIGI-VOTE V7: optional election banner image (PNG/JPEG). The bytes live in the media storage provider; the row
-- keeps only the storage key, verified content type and size.
ALTER TABLE elections
    ADD COLUMN banner_key          VARCHAR(255) NULL,
    ADD COLUMN banner_content_type VARCHAR(40)  NULL,
    ADD COLUMN banner_size         INT          NULL,
    ADD CONSTRAINT ck_elections_banner CHECK (
        (banner_key IS NULL AND banner_content_type IS NULL AND banner_size IS NULL)
        OR (banner_key IS NOT NULL AND banner_content_type IN ('image/png', 'image/jpeg') AND banner_size > 0));
