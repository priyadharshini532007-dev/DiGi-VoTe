package com.digivote;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * DIGI-VOTE: universal secure election management platform.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableAsync
public class DigiVoteApplication {

    public static void main(String[] args) {
        SpringApplication.run(DigiVoteApplication.class, args);
    }
}
