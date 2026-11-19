package com.digivote.candidate;

import com.digivote.audit.AuditEventType;
import com.digivote.audit.AuditService;
import com.digivote.election.ElectionStatus;
import com.digivote.election.state.ElectionLifecycleEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Observer: freezes every manifesto of an election when voting opens. Runs synchronously inside the
 * transition's transaction, so voting cannot open without the freeze being committed with it.
 */
@Component
public class ManifestoFreezeListener {

    private final CandidateRepository candidates;
    private final ManifestoRepository manifestos;
    private final AuditService audit;
    private final Clock clock;

    public ManifestoFreezeListener(CandidateRepository candidates, ManifestoRepository manifestos, AuditService audit,
                                   Clock clock) {
        this.candidates = candidates;
        this.manifestos = manifestos;
        this.audit = audit;
        this.clock = clock;
    }

    @EventListener
    public void onTransition(ElectionLifecycleEvent event) {
        if (event.to() != ElectionStatus.VOTING) {
            return;
        }
        Instant now = clock.instant();
        List<Long> ids = candidates.findByElectionIdOrderByBallotPositionAsc(event.electionId()).stream()
                .map(Candidate::getId).toList();
        List<Manifesto> all = manifestos.findByCandidateIdIn(ids);
        all.forEach(m -> m.freeze(now));
        manifestos.saveAll(all);
        audit.record(AuditEventType.MANIFESTOS_FROZEN, event.organizationId(), event.electionId(), event.actorUserId(),
                Map.of("manifestos", all.size()));
    }
}
