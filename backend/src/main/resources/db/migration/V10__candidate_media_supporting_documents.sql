-- DIGI-VOTE V10: candidates can attach supporting documents (PDF) next to the manifesto PDF, poster, photo and video.
ALTER TABLE candidate_media DROP CHECK ck_media_type;
ALTER TABLE candidate_media ADD CONSTRAINT ck_media_type CHECK (media_type IN
    ('PHOTO', 'MANIFESTO_PDF', 'POSTER', 'VIDEO', 'SUPPORTING_DOCUMENT'));
