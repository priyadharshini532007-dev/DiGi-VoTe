package com.digivote.user;

import org.springframework.data.jpa.repository.JpaRepository;

public interface IdentityProfileRepository extends JpaRepository<IdentityProfile, Long> {

    boolean existsByIdNumberHash(String idNumberHash);
}
