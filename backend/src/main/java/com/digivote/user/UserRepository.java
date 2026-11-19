package com.digivote.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<UserAccount, Long> {

    Optional<UserAccount> findByEmail(String email);

    Optional<UserAccount> findByDvNumber(String dvNumber);

    boolean existsByMobileNumber(String mobileNumber);

    Optional<UserAccount> findByFirebaseUid(String firebaseUid);
}
