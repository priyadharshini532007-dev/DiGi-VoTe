package com.digivote.user;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Issues DV numbers ({@code DV-2026-00001}): a per-year counter incremented atomically in the database.
 * Must run inside the transaction that saves the account, so a rolled-back registration does not burn a number
 * and two concurrent registrations never receive the same one (the counter row is locked until commit).
 */
@Service
public class DvNumberService {

    private static final Pattern FORMAT = Pattern.compile("^DV-\\d{4}-\\d{5,}$");

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public DvNumberService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public String next() {
        int year = clock.instant().atZone(ZoneOffset.UTC).getYear();
        // LAST_INSERT_ID(expr) makes the incremented value readable on this connection without a second lock.
        jdbc.update("INSERT INTO dv_number_counters (year_no, last_number) VALUES (?, LAST_INSERT_ID(1)) "
                + "ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(last_number + 1)", year);
        Long n = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return format(year, n == null ? 1 : n);
    }

    public static String format(int year, long sequence) {
        return String.format(Locale.ROOT, "DV-%04d-%05d", year, sequence);
    }

    /** Upper-cases and strips spaces/dashes variants typed by users; returns null when it is not a DV number. */
    public static String normalize(String input) {
        if (input == null) {
            return null;
        }
        String s = input.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
        return FORMAT.matcher(s).matches() ? s : null;
    }
}
