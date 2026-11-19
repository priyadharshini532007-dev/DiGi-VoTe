-- DIGI-VOTE V12: optional QR confirmation of ballots (off unless digivote.qr-confirmation.enabled=true).
--
-- A ballot cast while confirmation is on is "pending": it sits in ballot_pending_confirmation and is left out of the
-- bulletin board, the tally and the aggregates until its signed QR receipt is submitted within 30 seconds. The ballots,
-- votes, tokens and receipts tables stay append-only and untouched. The marker table has NO timestamp and no voter
-- reference, so it adds no timing or identity information. A pending ballot that is never confirmed is simply never
-- counted ("voided" when its voter asked for a new credential).
CREATE TABLE ballot_pending_confirmation (
    ballot_id BIGINT  NOT NULL,
    voided    BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (ballot_id),
    CONSTRAINT fk_pending_ballot FOREIGN KEY (ballot_id) REFERENCES ballots (id)
) ENGINE = InnoDB;

-- A voter whose unconfirmed ballot was voided may receive a fresh credential: credentials are now numbered per voter.
ALTER TABLE eligible_voters ADD COLUMN credential_generation INT NOT NULL DEFAULT 1;
ALTER TABLE voting_credentials ADD COLUMN generation INT NOT NULL DEFAULT 1;
ALTER TABLE voting_credentials ADD CONSTRAINT uq_credential_voter_generation UNIQUE (eligible_voter_id, generation);
ALTER TABLE voting_credentials DROP INDEX uq_credential_voter;
