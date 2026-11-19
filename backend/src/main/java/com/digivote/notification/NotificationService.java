package com.digivote.notification;

import com.digivote.common.PageResponse;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;

@Service
public class NotificationService {

    private final NotificationRepository notifications;
    private final DeviceTokenRepository devices;
    private final PushGateway push;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, DeviceTokenRepository devices, PushGateway push,
                               Clock clock) {
        this.notifications = notifications;
        this.devices = devices;
        this.push = push;
        this.clock = clock;
    }

    public record NotificationView(Long id, String type, String title, String body, Long electionId,
                                   Instant createdAt, Instant readAt) {
    }

    public record NotificationPage(PageResponse<NotificationView> page, long unread) {
    }

    @Transactional
    public void notifyUsers(Collection<Long> userIds, Long orgId, Long electionId, String type, String title,
                            String body) {
        Instant now = clock.instant();
        List<Long> distinct = userIds.stream().distinct().toList();
        distinct.forEach(id -> notifications.save(new Notification(id, orgId, electionId, type, title, body, now)));
        if (push.isEnabled()) {
            push.send(devices.findByUserIdIn(distinct).stream().map(DeviceToken::getToken).toList(), title, body);
        }
    }

    @Transactional(readOnly = true)
    public NotificationPage list(Long userId, int page, int size) {
        var result = notifications.findByUserId(userId,
                PageResponse.pageable(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        return new NotificationPage(PageResponse.of(result, n -> new NotificationView(n.getId(), n.getType(),
                n.getTitle(), n.getBody(), n.getElectionId(), n.getCreatedAt(), n.getReadAt())),
                notifications.countByUserIdAndReadAtIsNull(userId));
    }

    @Transactional
    public void markRead(Long userId, Long notificationId) {
        notifications.findById(notificationId)
                .filter(n -> n.getUserId().equals(userId))
                .ifPresent(n -> n.markRead(clock.instant()));
    }

    @Transactional
    public void registerDevice(Long userId, String token) {
        if (devices.findByToken(token).isEmpty()) {
            devices.save(new DeviceToken(userId, token, clock.instant()));
        }
    }
}
