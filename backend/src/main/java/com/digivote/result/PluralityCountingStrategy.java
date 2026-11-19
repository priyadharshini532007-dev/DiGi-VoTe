package com.digivote.result;

import com.digivote.common.ApiException;
import com.digivote.election.CountingMethod;
import org.springframework.stereotype.Component;

/** First-past-the-post: one selection per ballot, the candidate with the most votes wins. */
@Component
public class PluralityCountingStrategy extends AbstractRankingStrategy {

    @Override
    public CountingMethod method() {
        return CountingMethod.PLURALITY;
    }

    @Override
    protected void validateTotals(int acceptedBallots, int totalSelections, int maxSelections) {
        if (totalSelections != acceptedBallots) {
            throw ApiException.conflict("TALLY_INCONSISTENT",
                    "Plurality requires exactly one selection per accepted ballot");
        }
    }

    @Override
    protected String describe() {
        return "Plurality: the candidate with the most votes wins.";
    }
}
