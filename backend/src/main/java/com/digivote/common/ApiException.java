package com.digivote.common;

import org.springframework.http.HttpStatus;

/**
 * Base class for errors that map to a specific HTTP status and a stable machine-readable code.
 * Messages must never contain secrets, ballot selections or identity data.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private java.util.List<ErrorResponse.FieldError> fieldErrors;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    /** Attaches the form field this error is about, so clients can show it next to the input. */
    public ApiException withField(String field, String message) {
        this.fieldErrors = java.util.List.of(new ErrorResponse.FieldError(field, message));
        return this;
    }

    public java.util.List<ErrorResponse.FieldError> getFieldErrors() {
        return fieldErrors;
    }

    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found");
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException rule(String code, String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message);
    }
}
