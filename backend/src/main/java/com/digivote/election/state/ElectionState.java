package com.digivote.election.state;

import com.digivote.election.ElectionStatus;

import java.util.Set;

/**
 * State pattern: each lifecycle state decides which transitions it permits and which operations are
 * open while the election is in it. Services ask the current state instead of comparing status values.
 */
public interface ElectionState {

    ElectionStatus status();

    Set<ElectionStatus> allowedTargets();

    default boolean canTransitionTo(ElectionStatus target) {
        return allowedTargets().contains(target);
    }

    default boolean allowsDetailEdits() {
        return false;
    }

    default boolean allowsRuleChanges() {
        return false;
    }

    default boolean acceptsCandidateApplications() {
        return false;
    }

    default boolean allowsCandidateReview() {
        return false;
    }

    default boolean allowsManifestoEdits() {
        return false;
    }

    default boolean allowsVoterListChanges() {
        return false;
    }

    default boolean acceptsBallots() {
        return false;
    }

    default boolean allowsResultGeneration() {
        return false;
    }

    default boolean isVisibleToMembers() {
        return true;
    }
}
