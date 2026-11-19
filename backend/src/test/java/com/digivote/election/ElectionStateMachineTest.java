package com.digivote.election;

import com.digivote.common.ApiException;
import com.digivote.election.state.ElectionStateMachine;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ElectionStateMachineTest {

    private final ElectionStateMachine machine = new ElectionStateMachine();

    @ParameterizedTest
    @CsvSource({"DRAFT,REGISTRATION", "REGISTRATION,CAMPAIGN", "CAMPAIGN,VOTING", "VOTING,VERIFICATION",
            "VERIFICATION,PUBLISHED", "PUBLISHED,ARCHIVED"})
    void permitsTheLifecycleInOrder(ElectionStatus from, ElectionStatus to) {
        assertThatCode(() -> machine.requireTransition(from, to)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @CsvSource({"DRAFT,VOTING", "REGISTRATION,DRAFT", "VOTING,PUBLISHED", "VOTING,CAMPAIGN", "PUBLISHED,VOTING",
            "ARCHIVED,DRAFT", "ARCHIVED,PUBLISHED", "VERIFICATION,VOTING", "DRAFT,ARCHIVED"})
    void rejectsInvalidTransitions(ElectionStatus from, ElectionStatus to) {
        assertThatThrownBy(() -> machine.requireTransition(from, to)).isInstanceOf(ApiException.class)
                .hasMessageContaining("Cannot move");
    }

    @Test
    void operationsDependOnState() {
        assertThat(machine.stateOf(ElectionStatus.REGISTRATION).acceptsCandidateApplications()).isTrue();
        assertThat(machine.stateOf(ElectionStatus.CAMPAIGN).acceptsCandidateApplications()).isFalse();
        assertThat(machine.stateOf(ElectionStatus.CAMPAIGN).allowsManifestoEdits()).isTrue();
        assertThat(machine.stateOf(ElectionStatus.VOTING).allowsManifestoEdits()).isFalse();
        assertThat(machine.stateOf(ElectionStatus.VOTING).acceptsBallots()).isTrue();
        assertThat(machine.stateOf(ElectionStatus.VERIFICATION).acceptsBallots()).isFalse();
        assertThat(machine.stateOf(ElectionStatus.VOTING).allowsRuleChanges()).isFalse();
        assertThat(machine.stateOf(ElectionStatus.VERIFICATION).allowsResultGeneration()).isTrue();
        assertThat(machine.stateOf(ElectionStatus.PUBLISHED).allowsResultGeneration()).isFalse();
        assertThat(machine.stateOf(ElectionStatus.DRAFT).isVisibleToMembers()).isFalse();
        for (ElectionStatus s : ElectionStatus.values()) {
            if (s != ElectionStatus.ARCHIVED) {
                assertThat(machine.stateOf(s).allowedTargets()).hasSize(1);
            }
        }
        assertThat(machine.stateOf(ElectionStatus.ARCHIVED).allowedTargets()).isEmpty();
    }
}
