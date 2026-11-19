package com.digivote.voting;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface VerificationReceiptRepository extends JpaRepository<VerificationReceipt, Long> {

    Optional<VerificationReceipt> findByReceiptCodeHash(String receiptCodeHash);

    long countByElectionId(Long electionId);
}
