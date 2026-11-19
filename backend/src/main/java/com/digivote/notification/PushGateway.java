package com.digivote.notification;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Firebase Cloud Messaging delivery. When Firebase is not configured, push is skipped and only the
 * in-app notification (already persisted) is shown. Payloads carry titles only, never ballot data.
 */
@Component
public class PushGateway {

    private static final Logger log = LoggerFactory.getLogger(PushGateway.class);

    private final ObjectProvider<FirebaseApp> firebaseApp;

    public PushGateway(ObjectProvider<FirebaseApp> firebaseApp) {
        this.firebaseApp = firebaseApp;
    }

    public boolean isEnabled() {
        return firebaseApp.getIfAvailable() != null;
    }

    @Async
    public void send(List<String> deviceTokens, String title, String body) {
        FirebaseApp app = firebaseApp.getIfAvailable();
        if (app == null || deviceTokens.isEmpty()) {
            return;
        }
        FirebaseMessaging messaging = FirebaseMessaging.getInstance(app);
        int failures = 0;
        for (String token : deviceTokens) {
            try {
                messaging.send(Message.builder()
                        .setToken(token)
                        .setNotification(com.google.firebase.messaging.Notification.builder()
                                .setTitle(title).setBody(body).build())
                        .build());
            } catch (FirebaseMessagingException e) {
                failures++;
            }
        }
        if (failures > 0) {
            log.warn("FCM delivery failed for {} of {} device(s)", failures, deviceTokens.size());
        }
    }
}
