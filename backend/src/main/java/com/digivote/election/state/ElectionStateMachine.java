package com.digivote.election.state;

import com.digivote.common.ApiException;
import com.digivote.election.Election;
import com.digivote.election.ElectionStatus;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.Map;

/** Resolves the {@link ElectionState} object for a status and validates transitions. */
@Component
public class ElectionStateMachine {

    private final Map<ElectionStatus, ElectionState> states = new EnumMap<>(ElectionStatus.class);

    public ElectionStateMachine() {
        register(new LifecycleStates.DraftState());
        register(new LifecycleStates.RegistrationState());
        register(new LifecycleStates.CampaignState());
        register(new LifecycleStates.VotingState());
        register(new LifecycleStates.VerificationState());
        register(new LifecycleStates.PublishedState());
        register(new LifecycleStates.ArchivedState());
    }

    private void register(ElectionState state) {
        states.put(state.status(), state);
    }

    public ElectionState stateOf(ElectionStatus status) {
        return states.get(status);
    }

    public ElectionState stateOf(Election election) {
        return stateOf(election.getStatus());
    }

    public void requireTransition(ElectionStatus from, ElectionStatus to) {
        if (!stateOf(from).canTransitionTo(to)) {
            throw ApiException.conflict("INVALID_TRANSITION", "Cannot move an election from " + from + " to " + to);
        }
    }

    /** Throws a uniform error when the current state does not permit an operation. */
    public void require(boolean allowed, Election election, String operation) {
        if (!allowed) {
            throw ApiException.conflict("OPERATION_NOT_ALLOWED_IN_STATE",
                    "Cannot " + operation + " while the election is " + election.getStatus());
        }
    }
}
