package com.digivote.result;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "election_result_items")
public class ElectionResultItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "result_id", nullable = false)
    private Long resultId;

    @Column(name = "option_index", nullable = false)
    private int optionIndex;

    @Column(name = "candidate_id")
    private Long candidateId;

    @Column(nullable = false)
    private String label;

    @Column(nullable = false)
    private int votes;

    @Column(name = "result_rank", nullable = false)
    private int rank;

    @Column(nullable = false)
    private boolean winner;

    @Column(name = "aggregate_ciphertext", nullable = false)
    private String aggregateCiphertext;

    protected ElectionResultItem() {
    }

    public ElectionResultItem(Long resultId, int optionIndex, Long candidateId, String label, int votes, int rank,
                              boolean winner, String aggregateCiphertext) {
        this.resultId = resultId;
        this.optionIndex = optionIndex;
        this.candidateId = candidateId;
        this.label = label;
        this.votes = votes;
        this.rank = rank;
        this.winner = winner;
        this.aggregateCiphertext = aggregateCiphertext;
    }

    public Long getResultId() {
        return resultId;
    }

    public int getOptionIndex() {
        return optionIndex;
    }

    public Long getCandidateId() {
        return candidateId;
    }

    public String getLabel() {
        return label;
    }

    public int getVotes() {
        return votes;
    }

    public int getRank() {
        return rank;
    }

    public boolean isWinner() {
        return winner;
    }

    public String getAggregateCiphertext() {
        return aggregateCiphertext;
    }
}
