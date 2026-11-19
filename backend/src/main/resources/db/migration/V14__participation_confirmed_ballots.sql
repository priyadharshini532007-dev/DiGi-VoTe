-- DIGI-VOTE V14: turnout counts ballots that count. With QR confirmation (V12) a ballot that is still waiting for its
-- QR receipt, or was never confirmed, is not part of the tally, so it must not be part of the participation figures.
DROP PROCEDURE IF EXISTS sp_election_participation;

DELIMITER $$
CREATE PROCEDURE sp_election_participation(IN p_election_id BIGINT)
BEGIN
    DECLARE v_eligible INT DEFAULT 0;
    DECLARE v_issued INT DEFAULT 0;
    DECLARE v_accepted INT DEFAULT 0;
    DECLARE v_all INT DEFAULT 0;

    SELECT COUNT(*) INTO v_eligible FROM eligible_voters
     WHERE election_id = p_election_id AND status = 'ELIGIBLE';
    SELECT COUNT(*) INTO v_issued FROM voting_credentials WHERE election_id = p_election_id;
    SELECT COUNT(*) INTO v_all FROM ballots WHERE election_id = p_election_id;
    SELECT COUNT(*) INTO v_accepted FROM ballots b
     WHERE b.election_id = p_election_id
       AND NOT EXISTS (SELECT 1 FROM ballot_pending_confirmation p WHERE p.ballot_id = b.id);

    SELECT p_election_id AS election_id,
           v_eligible    AS eligible_voters,
           v_issued      AS credentials_issued,
           v_accepted    AS accepted_ballots,
           CASE WHEN v_eligible = 0 THEN 0.00
                ELSE ROUND(v_accepted * 100.0 / v_eligible, 2) END AS turnout_percent,
           CASE WHEN v_all > v_issued THEN 1 ELSE 0 END           AS ballots_exceed_credentials;
END$$
DELIMITER ;
