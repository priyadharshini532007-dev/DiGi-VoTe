package com.digivote.audit;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface AuditChainHeadRepository extends JpaRepository<AuditChainHead, String> {

    @Modifying
    @Query(value = "INSERT IGNORE INTO audit_chain_heads (chain_key, last_seq, last_hash) VALUES (:key, 0, :genesis)",
            nativeQuery = true)
    void ensureExists(@Param("key") String chainKey, @Param("genesis") String genesisHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select h from AuditChainHead h where h.chainKey = :key")
    Optional<AuditChainHead> lock(@Param("key") String chainKey);
}
