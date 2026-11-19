package com.digivote.election.state;

import com.digivote.election.ElectionStatus;

/** Observer pattern: published on every accepted lifecycle transition. */
public record ElectionLifecycleEvent(Long electionId, Long organizationId, String electionTitle,
                                     ElectionStatus from, ElectionStatus to, Long actorUserId) {
}
