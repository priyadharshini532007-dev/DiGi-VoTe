-- DIGI-VOTE SQL objects: views, stored procedure, integrity triggers.

-- Participation per election. Joins only aggregate counts: the identity side (eligible_voters,
-- voting_credentials) and anonymous side (ballots) are counted separately, never joined row-to-row.
CREATE VIEW v_election_participation AS
SELECT e.id                                                         AS election_id,
       e.organization_id                                            AS organization_id,
       e.title                                                      AS title,
       e.status                                                     AS status,
       (SELECT COUNT(*) FROM eligible_voters ev
         WHERE ev.election_id = e.id AND ev.status = 'ELIGIBLE')    AS eligible_voters,
       (SELECT COUNT(*) FROM voting_credentials vc
         WHERE vc.election_id = e.id)                               AS credentials_issued,
       (SELECT COUNT(*) FROM ballots b
         WHERE b.election_id = e.id)                                AS accepted_ballots
FROM elections e;

-- Published results only. Generated-but-unpublished results never appear here.
CREATE VIEW v_published_results AS
SELECT r.election_id,
       e.organization_id,
       e.title          AS election_title,
       r.counting_method,
       r.accepted_ballots,
       r.tie_detected,
       r.bulletin_head_hash,
       r.published_at,
       i.option_index,
       i.candidate_id,
       i.label,
       i.votes,
       i.result_rank,
       i.winner
FROM election_results r
         JOIN elections e ON e.id = r.election_id
         JOIN election_result_items i ON i.result_id = r.id
WHERE r.status = 'PUBLISHED';

DELIMITER $$

-- Participation statistics with turnout percentage, used by reports and dashboards.
CREATE PROCEDURE sp_election_participation(IN p_election_id BIGINT)
BEGIN
    DECLARE v_eligible INT DEFAULT 0;
    DECLARE v_issued INT DEFAULT 0;
    DECLARE v_accepted INT DEFAULT 0;

    SELECT COUNT(*) INTO v_eligible FROM eligible_voters
     WHERE election_id = p_election_id AND status = 'ELIGIBLE';
    SELECT COUNT(*) INTO v_issued FROM voting_credentials WHERE election_id = p_election_id;
    SELECT COUNT(*) INTO v_accepted FROM ballots WHERE election_id = p_election_id;

    SELECT p_election_id AS election_id,
           v_eligible    AS eligible_voters,
           v_issued      AS credentials_issued,
           v_accepted    AS accepted_ballots,
           CASE WHEN v_eligible = 0 THEN 0.00
                ELSE ROUND(v_accepted * 100.0 / v_eligible, 2) END AS turnout_percent,
           CASE WHEN v_accepted > v_issued THEN 1 ELSE 0 END      AS ballots_exceed_credentials;
END$$

-- Audit history is append-only.
CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: audit_logs is append-only';
END$$

CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: audit_logs is append-only';
END$$

-- Accepted ballots and their ciphertexts cannot be changed or removed.
CREATE TRIGGER trg_ballots_no_update BEFORE UPDATE ON ballots
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: accepted ballots are immutable';
END$$

CREATE TRIGGER trg_ballots_no_delete BEFORE DELETE ON ballots
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: accepted ballots cannot be deleted';
END$$

CREATE TRIGGER trg_votes_no_update BEFORE UPDATE ON votes
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: vote ciphertexts are immutable';
END$$

CREATE TRIGGER trg_votes_no_delete BEFORE DELETE ON votes
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: vote ciphertexts cannot be deleted';
END$$

CREATE TRIGGER trg_bulletin_no_update BEFORE UPDATE ON bulletin_board_entries
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: bulletin board is append-only';
END$$

CREATE TRIGGER trg_bulletin_no_delete BEFORE DELETE ON bulletin_board_entries
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: bulletin board is append-only';
END$$

CREATE TRIGGER trg_receipts_no_update BEFORE UPDATE ON verification_receipts
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: verification receipts are immutable';
END$$

CREATE TRIGGER trg_receipts_no_delete BEFORE DELETE ON verification_receipts
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: verification receipts cannot be deleted';
END$$

CREATE TRIGGER trg_tokens_no_delete BEFORE DELETE ON voting_tokens
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: spent voting tokens cannot be deleted';
END$$

-- Published results are frozen.
CREATE TRIGGER trg_results_published_immutable BEFORE UPDATE ON election_results
FOR EACH ROW
BEGIN
    IF OLD.status = 'PUBLISHED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: published results cannot be modified';
    END IF;
END$$

CREATE TRIGGER trg_result_items_published_no_update BEFORE UPDATE ON election_result_items
FOR EACH ROW
BEGIN
    IF (SELECT status FROM election_results WHERE id = OLD.result_id) = 'PUBLISHED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: published results cannot be modified';
    END IF;
END$$

CREATE TRIGGER trg_result_items_published_no_delete BEFORE DELETE ON election_result_items
FOR EACH ROW
BEGIN
    IF (SELECT status FROM election_results WHERE id = OLD.result_id) = 'PUBLISHED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: published results cannot be modified';
    END IF;
END$$

-- Frozen manifestos are read-only.
CREATE TRIGGER trg_manifesto_frozen BEFORE UPDATE ON manifestos
FOR EACH ROW
BEGIN
    IF OLD.frozen = TRUE THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: manifesto is frozen';
    END IF;
END$$

-- Archived elections are read-only.
CREATE TRIGGER trg_election_archived_readonly BEFORE UPDATE ON elections
FOR EACH ROW
BEGIN
    IF OLD.status = 'ARCHIVED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DIGI-VOTE: archived elections are read-only';
    END IF;
END$$

DELIMITER ;
