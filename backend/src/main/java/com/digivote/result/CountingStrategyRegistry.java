package com.digivote.result;

import com.digivote.election.CountingMethod;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** Looks up the {@link CountingStrategy} configured by an election's rules. */
@Component
public class CountingStrategyRegistry {

    private final Map<CountingMethod, CountingStrategy> strategies = new EnumMap<>(CountingMethod.class);

    public CountingStrategyRegistry(List<CountingStrategy> available) {
        available.forEach(s -> strategies.put(s.method(), s));
    }

    public CountingStrategy forMethod(CountingMethod method) {
        CountingStrategy strategy = strategies.get(method);
        if (strategy == null) {
            throw new IllegalStateException("No counting strategy for " + method);
        }
        return strategy;
    }
}
