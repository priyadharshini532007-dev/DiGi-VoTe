package com.digivote.verification;

import com.digivote.common.Hashing;
import com.digivote.crypto.SecureTokens;
import com.digivote.voting.Ballot;
import com.digivote.voting.BallotRepository;
import com.digivote.voting.BulletinBoardEntry;
import com.digivote.voting.BulletinBoardRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Public bulletin board: one hash-chained entry per accepted ballot, carrying only the ballot
 * commitment (SHA-256 over the ballot's ciphertexts). Ballots are not appended when accepted; they are
 * published in shuffled batches (see {@link #publishPending}), so bulletin positions do not reveal the
 * order in which ballots, and therefore voters, arrived. Anyone can recompute the chain from the
 * published entries and compare the head hash with the one recorded in the results.
 */
@Service
public class BulletinBoardService {

    private final BulletinBoardRepository entries;
    private final BallotRepository ballots;

    public BulletinBoardService(BulletinBoardRepository entries, BallotRepository ballots) {
        this.entries = entries;
        this.ballots = ballots;
    }

    public static String genesis(Long electionId) {
        return Hashing.sha256Hex("DIGI-VOTE-BB-GENESIS|" + electionId);
    }

    public static String entryHash(Long electionId, int seq, String commitment, String prevHash) {
        return Hashing.sha256Hex("DIGI-VOTE-BB-v1|" + electionId + "|" + seq + "|" + commitment + "|" + prevHash);
    }

    /**
     * Appends every unpublished ballot of the election to the board in a uniformly random order (SecureRandom
     * Fisher-Yates shuffle), but only if at least {@code minimum} are waiting. All entries of one batch share the
     * same publication minute. Caller must hold the per-election ballot lock (election_keys row), so batches and
     * sequence numbers are assigned serially and no ballot is published twice.
     *
     * @return number of entries appended
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public int publishPending(Long electionId, int minimum, LocalDateTime minute) {
        List<Ballot> pending = new ArrayList<>(ballots.findUnpublished(electionId));
        if (pending.isEmpty() || pending.size() < minimum) {
            return 0;
        }
        pending.sort(java.util.Comparator.comparing(Ballot::getBallotCommitment)); // canonical before shuffling
        Collections.shuffle(pending, SecureTokens.random());
        for (Ballot ballot : pending) {
            append(ballot, minute);
        }
        return pending.size();
    }

    private BulletinBoardEntry append(Ballot ballot, LocalDateTime minute) {
        Long electionId = ballot.getElectionId();
        BulletinBoardEntry last = entries.findTopByElectionIdOrderBySeqDesc(electionId).orElse(null);
        int seq = last == null ? 1 : last.getSeq() + 1;
        String prev = last == null ? genesis(electionId) : last.getEntryHash();
        return entries.save(new BulletinBoardEntry(electionId, seq, ballot.getId(), ballot.getBallotCommitment(), prev,
                entryHash(electionId, seq, ballot.getBallotCommitment(), prev), minute));
    }

    public record ChainCheck(boolean valid, int entries, String headHash, List<String> problems) {
    }

    @Transactional(readOnly = true)
    public ChainCheck verify(Long electionId) {
        List<BulletinBoardEntry> all = entries.findByElectionIdOrderBySeqAsc(electionId);
        List<String> problems = new ArrayList<>();
        String prev = genesis(electionId);
        int expected = 1;
        for (BulletinBoardEntry e : all) {
            if (e.getSeq() != expected) {
                problems.add("Sequence gap at " + expected);
            }
            if (!e.getPrevHash().equals(prev)) {
                problems.add("Broken link at entry " + e.getSeq());
            }
            if (!entryHash(electionId, e.getSeq(), e.getBallotCommitment(), e.getPrevHash()).equals(e.getEntryHash())) {
                problems.add("Entry " + e.getSeq() + " hash mismatch");
            }
            prev = e.getEntryHash();
            expected = e.getSeq() + 1;
        }
        return new ChainCheck(problems.isEmpty(), all.size(), prev, List.copyOf(problems));
    }
}
