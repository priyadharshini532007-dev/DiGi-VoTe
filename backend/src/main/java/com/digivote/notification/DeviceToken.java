package com.digivote.notification;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Firebase Cloud Messaging registration token of a signed-in browser. */
@Entity
@Table(name = "device_tokens")
public class DeviceToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, unique = true)
    private String token;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DeviceToken() {
    }

    public DeviceToken(Long userId, String token, Instant now) {
        this.userId = userId;
        this.token = token;
        this.createdAt = now;
    }

    public Long getUserId() {
        return userId;
    }

    public String getToken() {
        return token;
    }
}
