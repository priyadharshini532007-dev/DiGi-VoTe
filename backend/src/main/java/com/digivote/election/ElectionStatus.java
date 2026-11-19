package com.digivote.election;

/** Election lifecycle states, in order. Transitions are governed by {@link com.digivote.election.state.ElectionStateMachine}. */
public enum ElectionStatus {
    DRAFT, REGISTRATION, CAMPAIGN, VOTING, VERIFICATION, PUBLISHED, ARCHIVED
}
