package com.digivote.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class TimeConfig {

    /** Single UTC clock; tests replace it to simulate voting windows. */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
