package com.digivote.result;

import com.digivote.common.ApiException;
import com.digivote.election.CountingMethod;
import org.springframework.stereotype.Component;

/** Approval voting: each ballot approves 1..maxSelections candidates; the most-approved candidate wins. */
@Component
public class ApprovalCountingStrategy extends AbstractRankingStrategy {

    @Override
    public CountingMethod method() {
        return CountingMethod.APPROVAL;
    }

    @Override
    protected void validateTotals(int acceptedBallots, int totalSelections, int maxSelections) {
        if (totalSelections < acceptedBallots || totalSelections > (long) acceptedBallots * maxSelections) {
            throw ApiException.conflict("TALLY_INCONSISTENT",
                    "Approval totals must lie between one and max selections per accepted ballot");
        }
    }

    @Override
    protected String describe() {
        return "Approval: the candidate approved on the most ballots wins.";
    }
}
