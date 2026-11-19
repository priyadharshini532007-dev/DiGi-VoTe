package com.digivote.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PasswordRecoveryRepository extends JpaRepository<PasswordRecovery, Long> {

    Optional<PasswordRecovery> findByUserIdAndCodeHash(Long userId, String codeHash);

    List<PasswordRecovery> findByUserIdAndUsedAtIsNull(Long userId);
}
