package com.digivote.voting;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PendingConfirmationRepository extends JpaRepository<PendingConfirmation, Long> {
}
