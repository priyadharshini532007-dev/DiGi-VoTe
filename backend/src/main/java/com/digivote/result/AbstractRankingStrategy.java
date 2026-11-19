package com.digivote.result;

import com.digivote.common.ApiException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Template method shared by ranking strategies: validate totals (strategy-specific), rank options by
 * votes with competition ranking (1, 1, 3), then decide winners with an explicit tie policy:
 * <ul>
 *   <li>No accepted ballots: no winner.</li>
 *   <li>NOTA never wins; if NOTA strictly exceeds every candidate, no winner is declared.</li>
 *   <li>Two or more candidates sharing the highest count: tie flagged, no winner declared. The
 *       organization resolves ties by its own policy (e.g. a run-off election); DIGI-VOTE does not
 *       break ties randomly.</li>
 * </ul>
 */
public abstract class AbstractRankingStrategy implements CountingStrategy {

    /** Strategy-specific consistency check between ballot count and decrypted selection totals. */
    protected abstract void validateTotals(int acceptedBallots, int totalSelections, int maxSelections);

    protected abstract String describe();

    @Override
    public final Outcome count(List<OptionTally> tallies, int acceptedBallots, int totalSelections, int maxSelections) {
        long sum = tallies.stream().mapToLong(OptionTally::votes).sum();
        if (sum != totalSelections) {
            throw ApiException.conflict("TALLY_INCONSISTENT", "Option totals do not add up to the selection total");
        }
        validateTotals(acceptedBallots, totalSelections, maxSelections);

        List<OptionTally> sorted = new ArrayList<>(tallies);
        sorted.sort(Comparator.comparingLong(OptionTally::votes).reversed()
                .thenComparingInt(OptionTally::optionIndex));

        long topCandidateVotes = tallies.stream().filter(t -> !t.nota()).mapToLong(OptionTally::votes).max().orElse(0);
        long notaVotes = tallies.stream().filter(OptionTally::nota).mapToLong(OptionTally::votes).sum();
        long leaders = tallies.stream().filter(t -> !t.nota() && t.votes() == topCandidateVotes).count();

        boolean noBallots = acceptedBallots == 0;
        boolean notaLeads = notaVotes > topCandidateVotes;
        boolean tie = !noBallots && !notaLeads && leaders > 1;
        boolean declareWinner = !noBallots && !notaLeads && !tie && topCandidateVotes > 0;

        List<RankedOption> ranking = new ArrayList<>();
        int rank = 0;
        long previous = -1;
        for (int i = 0; i < sorted.size(); i++) {
            OptionTally t = sorted.get(i);
            if (t.votes() != previous) {
                rank = i + 1;
                previous = t.votes();
            }
            boolean winner = declareWinner && !t.nota() && t.votes() == topCandidateVotes;
            ranking.add(new RankedOption(t, rank, winner));
        }

        String explanation;
        if (noBallots) {
            explanation = "No ballots were accepted; no winner is declared.";
        } else if (notaLeads) {
            explanation = "None Of The Above received the most votes; no candidate is declared the winner.";
        } else if (tie) {
            explanation = leaders + " candidates tied with " + topCandidateVotes
                    + " votes; no winner is declared and the tie is referred to the organization's tie policy.";
        } else {
            OptionTally winner = sorted.stream().filter(t -> !t.nota()).findFirst().orElseThrow();
            explanation = winner.label() + " wins with " + winner.votes() + " vote(s). " + describe();
        }
        return new Outcome(List.copyOf(ranking), tie, explanation);
    }
}
