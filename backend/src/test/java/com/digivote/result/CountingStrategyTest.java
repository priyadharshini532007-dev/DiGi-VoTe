package com.digivote.result;

import com.digivote.common.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CountingStrategyTest {

    private final CountingStrategy plurality = new PluralityCountingStrategy();
    private final CountingStrategy approval = new ApprovalCountingStrategy();

    private static CountingStrategy.OptionTally t(int i, String label, long votes) {
        return new CountingStrategy.OptionTally(i, (long) i + 1, label, false, votes);
    }

    private static CountingStrategy.OptionTally nota(int i, long votes) {
        return new CountingStrategy.OptionTally(i, null, "NOTA", true, votes);
    }

    @Test
    void pluralityPicksSingleWinnerAndRanksZeroVoteCandidates() {
        var out = plurality.count(List.of(t(0, "A", 5), t(1, "B", 2), t(2, "C", 0)), 7, 7, 1);
        assertThat(out.tie()).isFalse();
        assertThat(out.ranking().get(0).option().label()).isEqualTo("A");
        assertThat(out.ranking().get(0).winner()).isTrue();
        assertThat(out.ranking().get(2).option().votes()).isZero();
        assertThat(out.ranking().get(2).rank()).isEqualTo(3);
        assertThat(out.ranking().stream().filter(CountingStrategy.RankedOption::winner)).hasSize(1);
        assertThat(out.explanation()).startsWith("A wins with 5");
    }

    @Test
    void tieDeclaresNoWinner() {
        var out = plurality.count(List.of(t(0, "A", 3), t(1, "B", 3), t(2, "C", 1)), 7, 7, 1);
        assertThat(out.tie()).isTrue();
        assertThat(out.ranking()).noneMatch(CountingStrategy.RankedOption::winner);
        assertThat(out.ranking().get(0).rank()).isEqualTo(1);
        assertThat(out.ranking().get(1).rank()).isEqualTo(1);
        assertThat(out.ranking().get(2).rank()).isEqualTo(3);
    }

    @Test
    void zeroBallotsDeclaresNoWinner() {
        var out = plurality.count(List.of(t(0, "A", 0), t(1, "B", 0)), 0, 0, 1);
        assertThat(out.tie()).isFalse();
        assertThat(out.ranking()).noneMatch(CountingStrategy.RankedOption::winner);
        assertThat(out.explanation()).contains("No ballots");
    }

    @Test
    void notaNeverWins() {
        var out = plurality.count(List.of(t(0, "A", 1), t(1, "B", 1), nota(2, 4)), 6, 6, 1);
        assertThat(out.ranking()).noneMatch(CountingStrategy.RankedOption::winner);
        assertThat(out.explanation()).contains("None Of The Above");
    }

    @Test
    void inconsistentTotalsAreRejected() {
        assertThatThrownBy(() -> plurality.count(List.of(t(0, "A", 3)), 2, 3, 1)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> plurality.count(List.of(t(0, "A", 3)), 3, 4, 1)).isInstanceOf(ApiException.class);
    }

    @Test
    void approvalAllowsMultipleSelectionsWithinBounds() {
        var out = approval.count(List.of(t(0, "A", 3), t(1, "B", 2), t(2, "C", 1)), 3, 6, 2);
        assertThat(out.ranking().get(0).winner()).isTrue();
        assertThatThrownBy(() -> approval.count(List.of(t(0, "A", 7)), 3, 7, 2)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> approval.count(List.of(t(0, "A", 2)), 3, 2, 2)).isInstanceOf(ApiException.class);
    }

    @Test
    void registrySelectsStrategyByMethod() {
        var registry = new CountingStrategyRegistry(List.of(plurality, approval));
        assertThat(registry.forMethod(com.digivote.election.CountingMethod.APPROVAL)).isSameAs(approval);
        assertThat(registry.forMethod(com.digivote.election.CountingMethod.PLURALITY)).isSameAs(plurality);
    }
}
