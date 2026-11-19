package com.digivote.result;

import com.digivote.election.CountingMethod;

import java.time.Instant;
import java.util.List;

public final class ResultDtos {

    private ResultDtos() {
    }

    public record ResultItemView(int optionIndex, Long candidateId, String label, int votes, double percent,
                                 int rank, boolean winner) {
    }

    public record ResultView(Long electionId, String electionTitle, String status, CountingMethod countingMethod,
                             int acceptedBallots, int totalSelections, boolean tieDetected, String explanation,
                             String bulletinHeadHash, String resultHash, int generationCount, Instant generatedAt,
                             Instant publishedAt, List<ResultItemView> items) {
    }

    public record AggregationCheck(boolean valid, int ballotsChecked, int commitmentMismatches,
                                   int malformedBallots, int optionsChecked, int aggregateMismatches,
                                   List<String> problems) {
    }
}
