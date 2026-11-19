-- DIGI-VOTE V4: remove ordering and timing metadata that could pair a voter with a ballot.
-- * New ballots, votes, spent tokens and receipts get random (non-sequential) ids assigned by the application.
-- * New ballots and receipts no longer store an acceptance time or a selection count (columns become nullable;
--   historic rows keep their values: they are immutable and audit history is never rewritten).
-- * Bulletin-board entries are appended in shuffled batches, so their sequence numbers no longer follow
--   acceptance order.
ALTER TABLE ballots MODIFY accepted_at_minute DATETIME NULL, MODIFY selection_count INT NULL;
ALTER TABLE verification_receipts MODIFY issued_at_minute DATETIME NULL;

-- Key transparency: an election's credential-signing key (and its published fingerprint) can never be
-- swapped or removed once voting has opened.
DELIMITER $$
CREATE TRIGGER trg_election_keys_no_update BEFORE UPDATE ON election_keys
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: election keys are immutable';
END$$

CREATE TRIGGER trg_election_keys_no_delete BEFORE DELETE ON election_keys
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: election keys cannot be deleted';
END$$
DELIMITER ;
