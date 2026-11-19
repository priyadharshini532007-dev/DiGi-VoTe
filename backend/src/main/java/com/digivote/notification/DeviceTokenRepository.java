package com.digivote.notification;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface DeviceTokenRepository extends JpaRepository<DeviceToken, Long> {

    List<DeviceToken> findByUserIdIn(Collection<Long> userIds);

    Optional<DeviceToken> findByToken(String token);
}
