package com.digivote.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Tip of one audit chain; locked FOR UPDATE while appending so sequence numbers never fork. */
@Entity
@Table(name = "audit_chain_heads")
public class AuditChainHead {

    @Id
    @Column(name = "chain_key")
    private String chainKey;

    @Column(name = "last_seq", nullable = false)
    private long lastSeq;

    @Column(name = "last_hash", nullable = false)
    private String lastHash;

    protected AuditChainHead() {
    }

    public void advance(long seq, String hash) {
        this.lastSeq = seq;
        this.lastHash = hash;
    }

    public String getChainKey() {
        return chainKey;
    }

    public long getLastSeq() {
        return lastSeq;
    }

    public String getLastHash() {
        return lastHash;
    }
}
