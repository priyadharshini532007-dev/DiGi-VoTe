package com.digivote.election;

public enum CountingMethod {
    /** Single choice; the option with the most votes wins. */
    PLURALITY,
    /** Up to max_selections choices per ballot; each selection counts once. */
    APPROVAL
}
