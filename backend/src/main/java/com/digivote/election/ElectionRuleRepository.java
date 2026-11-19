package com.digivote.election;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ElectionRuleRepository extends JpaRepository<ElectionRule, Long> {
}
