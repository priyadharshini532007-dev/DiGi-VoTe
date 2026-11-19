package com.digivote.voting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.hibernate.annotations.Immutable;
import org.springframework.data.domain.Persistable;

/** One Paillier ciphertext per ballot option (Enc(1) if selected, Enc(0) otherwise). Random id. */
@Entity
@Immutable
@Table(name = "votes")
public class Vote implements Persistable<Long> {

    @Id
    private Long id;

    @Transient
    private boolean fresh;

    @Column(name = "ballot_id", nullable = false)
    private Long ballotId;

    @Column(name = "option_index", nullable = false)
    private int optionIndex;

    @Column(nullable = false)
    private String ciphertext;

    protected Vote() {
    }

    public Vote(Long ballotId, int optionIndex, String ciphertext) {
        this.id = AnonymousIds.next();
        this.fresh = true;
        this.ballotId = ballotId;
        this.optionIndex = optionIndex;
        this.ciphertext = ciphertext;
    }

    @Override
    public Long getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return fresh;
    }

    public Long getBallotId() {
        return ballotId;
    }

    public int getOptionIndex() {
        return optionIndex;
    }

    public String getCiphertext() {
        return ciphertext;
    }
}
