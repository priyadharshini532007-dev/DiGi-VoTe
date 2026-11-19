package com.digivote.election;

import com.digivote.common.ApiException;
import com.digivote.election.rules.RuleEngine;
import com.digivote.election.rules.RuleViolation;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RuleEngineTest {

    private final RuleEngine engine = new RuleEngine();
    private final Instant now = Instant.parse("2026-10-10T10:00:00Z");

    static RuleSettings valid(Instant now) {
        return new RuleSettings(1, CountingMethod.PLURALITY, true, true, true, true, true, false, true, false,
                ElectionRule.PublicationPolicy.MANUAL, 2, now, now.plusSeconds(3600), now.plusSeconds(3600),
                now.plusSeconds(7200), now.plusSeconds(3600));
    }

    private List<String> codes(RuleSettings s) {
        return engine.validateForPublication(s, now).stream().map(RuleViolation::code).toList();
    }

    @Test
    void validRuleSetPasses() {
        assertThat(engine.validateForPublication(valid(now), now)).isEmpty();
    }

    @Test
    void pluralityRequiresSingleSelection() {
        RuleSettings s = valid(now);
        assertThat(codes(new RuleSettings(2, s.countingMethod(), true, true, true, true, true, false, true, false,
                s.resultPublicationPolicy(), 2, s.campaignStart(), s.campaignEnd(), s.votingStart(), s.votingEnd(),
                s.withdrawalDeadline()))).contains("PLURALITY_SINGLE_CHOICE");
    }

    @Test
    void approvalRequiresMultipleSelectionsWithinCandidateCount() {
        RuleSettings s = valid(now);
        assertThat(codes(new RuleSettings(1, CountingMethod.APPROVAL, true, true, true, true, true, false, true, false,
                s.resultPublicationPolicy(), 2, s.campaignStart(), s.campaignEnd(), s.votingStart(), s.votingEnd(),
                null))).contains("APPROVAL_MULTI_CHOICE");
        assertThat(codes(new RuleSettings(3, CountingMethod.APPROVAL, true, true, true, true, true, false, true, false,
                s.resultPublicationPolicy(), 2, s.campaignStart(), s.campaignEnd(), s.votingStart(), s.votingEnd(),
                null))).contains("EXCEEDS_MIN_CANDIDATES");
    }

    @Test
    void invalidCombinationsAreReported() {
        RuleSettings s = valid(now);
        // single candidate without NOTA, QR without receipts, non-anonymous, overlapping campaign, missing schedule
        RuleSettings bad = new RuleSettings(1, CountingMethod.PLURALITY, true, false, true, true, false, false, true,
                false, ElectionRule.PublicationPolicy.MANUAL, 1, now, now.plusSeconds(9000), now.plusSeconds(3600),
                null, now.plusSeconds(9999));
        assertThat(codes(bad)).contains("SINGLE_CANDIDATE_NEEDS_NOTA", "QR_NEEDS_RECEIPTS", "UNSUPPORTED", "OVERLAP",
                "REQUIRED", "AFTER_VOTING");
        assertThat(codes(new RuleSettings(1, s.countingMethod(), true, true, true, true, true, false, true, false,
                s.resultPublicationPolicy(), 2, null, null, now.plusSeconds(100), now.plusSeconds(50), null)))
                .contains("WINDOW");
        assertThat(codes(new RuleSettings(1, s.countingMethod(), true, true, true, true, true, false, true, false,
                s.resultPublicationPolicy(), 2, null, null, now.minusSeconds(100), now.minusSeconds(50), null)))
                .contains("IN_PAST");
    }

    @Test
    void requireValidThrowsWithFirstMessage() {
        assertThatThrownBy(() -> engine.requireValid(List.of(new RuleViolation("f", "C", "Bad rule"))))
                .isInstanceOf(ApiException.class).hasMessageContaining("Bad rule");
    }

    private ElectionRule rule(boolean nota, int max) {
        ElectionRule rule = new ElectionRule(1L, now);
        RuleSettings s = valid(now);
        rule.replaceWith(new RuleSettings(max, max == 1 ? CountingMethod.PLURALITY : CountingMethod.APPROVAL, true,
                true, true, true, true, nota, true, false, s.resultPublicationPolicy(), 3, s.campaignStart(),
                s.campaignEnd(), s.votingStart(), s.votingEnd(), s.withdrawalDeadline()), now);
        return rule;
    }

    @Test
    void ballotSelectionValidation() {
        ElectionRule single = rule(true, 1);
        engine.validateSelection(single, List.of(0), 3);
        engine.validateSelection(single, List.of(3), 3); // NOTA
        assertThatThrownBy(() -> engine.validateSelection(single, List.of(), 3)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> engine.validateSelection(single, List.of(0, 1), 3)).hasMessageContaining("At most");
        assertThatThrownBy(() -> engine.validateSelection(single, List.of(4), 3)).hasMessageContaining("not an option");
        assertThatThrownBy(() -> engine.validateSelection(single, List.of(-1), 3)).hasMessageContaining("not an option");
        ElectionRule multi = rule(true, 2);
        engine.validateSelection(multi, List.of(0, 2), 3);
        assertThatThrownBy(() -> engine.validateSelection(multi, List.of(1, 1), 3)).hasMessageContaining("Duplicate");
        assertThatThrownBy(() -> engine.validateSelection(multi, List.of(0, 3), 3)).hasMessageContaining("None Of The Above");
        ElectionRule noNota = rule(false, 1);
        assertThatThrownBy(() -> engine.validateSelection(noNota, List.of(3), 3)).hasMessageContaining("not an option");
    }

    @Test
    void votingWindowAndWithdrawalDeadline() {
        ElectionRule r = rule(false, 1);
        assertThat(engine.votingWindowOpen(r, now)).isFalse();
        assertThat(engine.votingWindowOpen(r, now.plusSeconds(3600))).isTrue();
        assertThat(engine.votingWindowOpen(r, now.plusSeconds(7200))).isFalse();
        assertThat(engine.votingWindowEnded(r, now.plusSeconds(7200))).isTrue();
        assertThat(engine.withdrawalAllowed(r, now)).isTrue();
        assertThat(engine.withdrawalAllowed(r, now.plusSeconds(3600))).isFalse();
    }
}
