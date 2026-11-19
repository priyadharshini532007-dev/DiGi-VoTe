package com.digivote.voting;

import com.digivote.common.Hashing;

import java.util.List;

/** Ballot commitment = SHA-256("DIGI-VOTE-BALLOT-v1|electionId|c0|c1|...|cK") over the option ciphertexts (hex). */
public final class BallotCommitments {

    private BallotCommitments() {
    }

    public static String commit(Long electionId, List<String> ciphertextsInOptionOrder) {
        return Hashing.sha256Hex("DIGI-VOTE-BALLOT-v1|" + electionId + "|" + String.join("|", ciphertextsInOptionOrder));
    }
}
