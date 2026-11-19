-- DIGI-VOTE V9: separate Education and Experience on candidate applications/profiles, and an Initiatives section in
-- manifestos. Existing rows keep NULL. (The manifesto freeze trigger only blocks UPDATEs of frozen rows; adding a
-- column does not touch it.)
ALTER TABLE candidate_applications
    ADD COLUMN education  VARCHAR(2000) NULL AFTER qualifications,
    ADD COLUMN experience VARCHAR(2000) NULL AFTER education;
ALTER TABLE candidates
    ADD COLUMN education  VARCHAR(2000) NULL AFTER qualifications,
    ADD COLUMN experience VARCHAR(2000) NULL AFTER education;
ALTER TABLE manifestos
    ADD COLUMN initiatives TEXT NULL AFTER schemes; -- TEXT: the table is at the row-size limit with four VARCHAR(4000) columns
