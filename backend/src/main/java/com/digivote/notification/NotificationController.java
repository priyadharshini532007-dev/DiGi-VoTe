package com.digivote.notification;

import com.digivote.access.AccessControlService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
@Tag(name = "Notifications")
public class NotificationController {

    private final NotificationService notifications;
    private final AccessControlService access;

    public NotificationController(NotificationService notifications, AccessControlService access) {
        this.notifications = notifications;
        this.access = access;
    }

    public record DeviceTokenRequest(@NotBlank @Size(max = 255) String token) {
    }

    @GetMapping("/notifications")
    public NotificationService.NotificationPage list(@RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "20") int size) {
        return notifications.list(access.currentAccount().getId(), page, size);
    }

    @PostMapping("/notifications/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@PathVariable Long id) {
        notifications.markRead(access.currentAccount().getId(), id);
    }

    @PostMapping("/device-tokens")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void registerDevice(@Valid @RequestBody DeviceTokenRequest request) {
        notifications.registerDevice(access.currentAccount().getId(), request.token());
    }
}
