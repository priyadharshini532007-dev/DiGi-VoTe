package com.digivote.result;

import com.digivote.election.CountingMethod;

import java.util.List;

/** Strategy pattern: interchangeable vote-counting algorithms selected by the election's persisted rules. */
public interface CountingStrategy {

    CountingMethod method();

    Outcome count(List<OptionTally> tallies, int acceptedBallots, int totalSelections, int maxSelections);

    record OptionTally(int optionIndex, Long candidateId, String label, boolean nota, long votes) {
    }

    record RankedOption(OptionTally option, int rank, boolean winner) {
    }

    record Outcome(List<RankedOption> ranking, boolean tie, String explanation) {
    }
}
