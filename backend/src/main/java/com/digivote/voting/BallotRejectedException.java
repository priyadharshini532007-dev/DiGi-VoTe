package com.digivote.voting;

import com.digivote.audit.SecurityEvent;
import com.digivote.common.ApiException;
import org.springframework.http.HttpStatus;

/** A ballot refused for a security-relevant reason; carries what to record as a security event. */
public class BallotRejectedException extends ApiException {

    private final SecurityEvent.Type eventType;

    public BallotRejectedException(HttpStatus status, String code, String message, SecurityEvent.Type eventType) {
        super(status, code, message);
        this.eventType = eventType;
    }

    public SecurityEvent.Type getEventType() {
        return eventType;
    }
}
