package com.digivote.voting;

import com.digivote.crypto.SecureTokens;

/**
 * Random primary keys for anonymous-side rows (ballots, votes, spent tokens, receipts). Sequential
 * AUTO_INCREMENT ids would record acceptance order, which can be lined up with the identity-side order of
 * credential issuance; random 63-bit ids carry no ordering information.
 */
final class AnonymousIds {

    private AnonymousIds() {
    }

    static long next() {
        long id;
        do {
            id = SecureTokens.random().nextLong() & Long.MAX_VALUE;
        } while (id == 0);
        return id;
    }
}
