package com.digivote.notification;

import com.digivote.candidate.Candidate;
import com.digivote.candidate.CandidateRepository;
import com.digivote.election.state.ElectionLifecycleEvent;
import com.digivote.organization.Membership;
import com.digivote.organization.MembershipRepository;
import com.digivote.organization.RoleCode;
import com.digivote.voting.EligibleVoter;
import com.digivote.voting.EligibleVoterRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.ArrayList;
import java.util.List;

/** Observer: tells the affected people about lifecycle changes, after the transition has committed. */
@Component
public class ElectionNotificationListener {

    private final NotificationService notifications;
    private final EligibleVoterRepository voters;
    private final CandidateRepository candidates;
    private final MembershipRepository memberships;

    public ElectionNotificationListener(NotificationService notifications, EligibleVoterRepository voters,
                                        CandidateRepository candidates, MembershipRepository memberships) {
        this.notifications = notifications;
        this.voters = voters;
        this.candidates = candidates;
        this.memberships = memberships;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onTransition(ElectionLifecycleEvent e) {
        String title = e.electionTitle();
        switch (e.to()) {
            case REGISTRATION -> notifications.notifyUsers(
                    memberships.findByOrganizationIdAndRoleAndStatus(e.organizationId(), RoleCode.CANDIDATE,
                            Membership.Status.ACTIVE).stream().map(Membership::getUserId).toList(),
                    e.organizationId(), e.electionId(), "CANDIDATE_REGISTRATION_OPEN",
                    "Candidate registration open", "Applications are open for \"" + title + "\".");
            case CAMPAIGN -> notifications.notifyUsers(eligibleAndCandidates(e.electionId()), e.organizationId(),
                    e.electionId(), "CAMPAIGN_STARTED", "Campaign started",
                    "Candidate profiles and manifestos for \"" + title + "\" are now available.");
            case VOTING -> {
                notifications.notifyUsers(eligible(e.electionId()), e.organizationId(), e.electionId(),
                        "VOTING_OPEN", "Voting is open", "You can now cast your vote in \"" + title + "\".");
                notifications.notifyUsers(candidateUsers(e.electionId()), e.organizationId(), e.electionId(),
                        "MANIFESTO_FROZEN", "Manifesto frozen",
                        "Voting opened for \"" + title + "\"; manifestos are now read-only.");
            }
            case VERIFICATION -> notifications.notifyUsers(eligibleAndCandidates(e.electionId()), e.organizationId(),
                    e.electionId(), "VOTING_CLOSED", "Voting closed", "Voting has closed for \"" + title + "\".");
            case PUBLISHED -> notifications.notifyUsers(eligibleAndCandidates(e.electionId()), e.organizationId(),
                    e.electionId(), "RESULTS_PUBLISHED", "Results published",
                    "Results for \"" + title + "\" have been published.");
            default -> {
            }
        }
    }

    private List<Long> eligible(Long electionId) {
        return voters.findByElectionId(electionId, org.springframework.data.domain.Pageable.unpaged()).stream()
                .filter(EligibleVoter::isEligible).map(EligibleVoter::getUserId).toList();
    }

    private List<Long> candidateUsers(Long electionId) {
        return candidates.findByElectionIdAndStatusOrderByBallotPositionAsc(electionId, Candidate.Status.ACTIVE)
                .stream().map(Candidate::getUserId).toList();
    }

    private List<Long> eligibleAndCandidates(Long electionId) {
        List<Long> all = new ArrayList<>(eligible(electionId));
        all.addAll(candidateUsers(electionId));
        return all;
    }
}
