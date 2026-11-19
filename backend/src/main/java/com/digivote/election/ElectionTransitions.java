package com.digivote.election;

import java.time.Instant;

/**
 * Narrow bridge that lets the state-transition service change an election's status while keeping
 * {@link Election#applyTransition} package-private. Not exposed to controllers.
 */
public final class ElectionTransitions {

    private ElectionTransitions() {
    }

    public static void apply(Election election, ElectionStatus target, Instant now) {
        election.applyTransition(target, now);
    }
}
