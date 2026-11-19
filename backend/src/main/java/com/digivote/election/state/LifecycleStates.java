package com.digivote.election.state;

import com.digivote.election.ElectionStatus;

import java.util.Set;

/** Concrete lifecycle states (State pattern). */
final class LifecycleStates {

    private LifecycleStates() {
    }

    static final class DraftState implements ElectionState {
        public ElectionStatus status() { return ElectionStatus.DRAFT; }
        public Set<ElectionStatus> allowedTargets() { return Set.of(ElectionStatus.REGISTRATION); }
        public boolean allowsDetailEdits() { return true; }
        public boolean allowsRuleChanges() { return true; }
        public boolean allowsVoterListChanges() { return true; }
        public boolean isVisibleToMembers() { return false; }
    }

    static final class RegistrationState implements ElectionState {
        public ElectionStatus status() { return ElectionStatus.REGISTRATION; }
        public Set<ElectionStatus> allowedTargets() { return Set.of(ElectionStatus.CAMPAIGN); }
        public boolean allowsDetailEdits() { return true; }
        public boolean allowsRuleChanges() { return true; }
        public boolean acceptsCandidateApplications() { return true; }
        public boolean allowsCandidateReview() { return true; }
        public boolean allowsManifestoEdits() { return true; }
        public boolean allowsVoterListChanges() { return true; }
    }

    static final class CampaignState implements ElectionState {
        public ElectionStatus status() { return ElectionStatus.CAMPAIGN; }
        public Set<ElectionStatus> allowedTargets() { return Set.of(ElectionStatus.VOTING); }
        public boolean allowsRuleChanges() { return true; }
        public boolean allowsCandidateReview() { return true; }
        public boolean allowsManifestoEdits() { return true; }
        public boolean allowsVoterListChanges() { return true; }
    }

    static final class VotingState implements ElectionState {
        public ElectionStatus status() { return ElectionStatus.VOTING; }
        public Set<ElectionStatus> allowedTargets() { return Set.of(ElectionStatus.VERIFICATION); }
        public boolean acceptsBallots() { return true; }
    }

    static final class VerificationState implements ElectionState {
        public ElectionStatus status() { return ElectionStatus.VERIFICATION; }
        public Set<ElectionStatus> allowedTargets() { return Set.of(ElectionStatus.PUBLISHED); }
        public boolean allowsResultGeneration() { return true; }
    }

    static final class PublishedState implements ElectionState {
        public ElectionStatus status() { return ElectionStatus.PUBLISHED; }
        public Set<ElectionStatus> allowedTargets() { return Set.of(ElectionStatus.ARCHIVED); }
    }

    static final class ArchivedState implements ElectionState {
        public ElectionStatus status() { return ElectionStatus.ARCHIVED; }
        public Set<ElectionStatus> allowedTargets() { return Set.of(); }
    }
}
