package com.digivote.integration;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Migrations, constraints, views, the stored procedure and integrity triggers on real MySQL. */
class DatabaseIT extends IntegrationTestBase {

    @Test
    void migrationsCreateTheSchemaOnAFreshDatabase() {
        List<String> tables = jdbc.queryForList("SELECT table_name FROM information_schema.tables "
                + "WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'", String.class);
        assertThat(tables).contains("organizations", "users", "roles", "organization_memberships", "elections",
                "election_rules", "candidates", "candidate_applications", "manifestos", "candidate_media",
                "eligible_voters", "voting_credentials", "voting_tokens", "ballots", "votes", "verification_receipts",
                "bulletin_board_entries", "audit_logs", "notifications", "reports", "election_results",
                "election_result_items", "security_events", "flyway_schema_history");
        assertThat(count("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1")).isEqualTo(14);
        assertThat(count("SELECT COUNT(*) FROM roles")).isEqualTo(5);
        assertThat(count("SELECT COUNT(*) FROM information_schema.views WHERE table_schema = DATABASE()")).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = DATABASE() "
                + "AND routine_name = 'sp_election_participation'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = DATABASE()"))
                .isGreaterThanOrEqualTo(15);
    }

    @Test
    void anonymousTablesHoldNoIdentityColumns() {
        List<String> cols = jdbc.queryForList("SELECT CONCAT(table_name, '.', column_name) FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name IN ('ballots','votes','voting_tokens',"
                + "'verification_receipts','bulletin_board_entries')", String.class);
        assertThat(cols).isNotEmpty().noneMatch(c -> c.matches(".*\\.(user_id|email|eligible_voter_id|actor.*|"
                + "credential_id|membership_id|ip.*)"));
        long fkToIdentity = count("SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema = DATABASE() "
                + "AND table_name IN ('ballots','votes','voting_tokens','verification_receipts','bulletin_board_entries') "
                + "AND referenced_table_name IN ('users','eligible_voters','voting_credentials','organization_memberships')");
        assertThat(fkToIdentity).isZero();
    }

    @Test
    void triggersProtectBallotsAuditHistoryResultsManifestosAndArchives() throws Exception {
        Scenario s = voting();
        vote(s.voter1, s.electionId, 0);
        // ballots, votes, bulletin, tokens, receipts: no delete / update
        assertThatThrownBy(() -> jdbc.update("DELETE FROM ballots WHERE election_id = ?", s.electionId))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("cannot be deleted");
        assertThatThrownBy(() -> jdbc.update("UPDATE votes SET ciphertext = 'ff'"))
                .hasMessageContaining("immutable");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM voting_tokens")).hasMessageContaining("cannot be deleted");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM verification_receipts")).hasMessageContaining("cannot be deleted");
        // audit history
        assertThatThrownBy(() -> jdbc.update("UPDATE audit_logs SET event_type = 'X' WHERE seq = 1"))
                .hasMessageContaining("append-only");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM audit_logs")).hasMessageContaining("append-only");
        // frozen manifestos (voting opened)
        assertThatThrownBy(() -> jdbc.update("UPDATE manifestos SET vision = 'changed' WHERE candidate_id = ?",
                s.candidateIds.get(0))).hasMessageContaining("frozen");
        // published results and archived elections
        transition(s, "VERIFICATION"); // final shuffled batch reaches the bulletin board
        assertThatThrownBy(() -> jdbc.update("UPDATE bulletin_board_entries SET entry_hash = REPEAT('0',64)"))
                .hasMessageContaining("append-only");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM bulletin_board_entries")).hasMessageContaining("append-only");
        postOk("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
        transition(s, "PUBLISHED");
        assertThatThrownBy(() -> jdbc.update("UPDATE election_results SET accepted_ballots = 99 WHERE election_id = ?",
                s.electionId)).hasMessageContaining("published results cannot be modified");
        assertThatThrownBy(() -> jdbc.update("UPDATE election_result_items SET votes = 99")).hasMessageContaining("published");
        transition(s, "ARCHIVED");
        assertThatThrownBy(() -> jdbc.update("UPDATE elections SET title = 'x' WHERE id = ?", s.electionId))
                .hasMessageContaining("archived elections are read-only");
    }

    @Test
    void checkAndUniqueConstraintsAreEnforced() throws Exception {
        Scenario s = voting();
        assertThatThrownBy(() -> jdbc.update("UPDATE election_rules SET max_selections = 0 WHERE election_id = ?",
                s.electionId)).isInstanceOf(DataAccessException.class).hasMessageContaining("ck_rules_maxsel");
        assertThatThrownBy(() -> jdbc.update("UPDATE organizations SET primary_color = 'red' WHERE id = ?", s.orgId))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("ck_organizations_color");
        vote(s.voter1, s.electionId, 1);
        String hash = jdbc.queryForObject("SELECT token_hash FROM voting_tokens WHERE election_id = ?", String.class,
                s.electionId);
        Long ballot = jdbc.queryForObject("SELECT ballot_id FROM voting_tokens WHERE election_id = ?", Long.class,
                s.electionId);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO voting_tokens (election_id, token_hash, submission_nonce_hash, "
                + "ballot_id) VALUES (?, ?, REPEAT('a',64), ?)", s.electionId, hash, ballot))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("uq_token_election_hash");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO eligible_voters (election_id, user_id, status, added_by, added_at) "
                + "SELECT election_id, user_id, 'ELIGIBLE', added_by, NOW() FROM eligible_voters WHERE election_id = ? LIMIT 1",
                s.electionId)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void viewsAndStoredProcedureReportParticipation() throws Exception {
        Scenario s = voting();
        vote(s.voter1, s.electionId, 0);
        vote(s.voter2, s.electionId, 1);
        Map<String, Object> view = jdbc.queryForMap("SELECT * FROM v_election_participation WHERE election_id = ?",
                s.electionId);
        assertThat(((Number) view.get("accepted_ballots")).longValue()).isEqualTo(2);
        assertThat(((Number) view.get("credentials_issued")).longValue()).isEqualTo(2);
        Map<String, Object> proc = jdbc.queryForMap("CALL sp_election_participation(?)", s.electionId);
        long eligible = ((Number) proc.get("eligible_voters")).longValue();
        assertThat(eligible).isEqualTo(5); // 3 candidates + 2 voters
        assertThat(((Number) proc.get("turnout_percent")).doubleValue()).isEqualTo(40.0);
        assertThat(((Number) proc.get("ballots_exceed_credentials")).intValue()).isZero();
        JsonNode api = getOk("/api/elections/" + s.electionId + "/participation", s.admin);
        assertThat(api.get("accepted_ballots").asLong()).isEqualTo(2);

        assertThat(count("SELECT COUNT(*) FROM v_published_results WHERE election_id = ?", s.electionId)).isZero();
        transition(s, "VERIFICATION");
        postOk("/api/elections/" + s.electionId + "/results/generate", s.admin, null);
        assertThat(count("SELECT COUNT(*) FROM v_published_results WHERE election_id = ?", s.electionId)).isZero();
        transition(s, "PUBLISHED");
        assertThat(count("SELECT COUNT(*) FROM v_published_results WHERE election_id = ?", s.electionId)).isEqualTo(4);
    }
}
