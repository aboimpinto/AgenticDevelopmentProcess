Feature: Exact model metadata and productive readiness execution
  Scenario: MC-01 Read exact capacity for the selected provider
    Given two providers expose the same synthetic model name with different token capacities
    And the installed SDK exposes an exact configured capacity of 1050000 tokens
    When HEPHA scans the selected provider without contacting a model
    Then its catalogue preserves 1050000 rather than the rounded CLI value of 1.1M
    And another provider's limits and credential fields are excluded

  Scenario: MC-02 Fail bounded discovery without leaking private configuration
    Given the installed SDK fails, stalls, or exceeds the output bound
    When HEPHA scans available models
    Then the scan fails with a bounded sanitized outcome
    And it does not guess a context capacity or call a model

  Scenario: MC-03 Keep productive readiness alive without removing idle protection
    Given readiness pins an approved model route and its token spending budget
    When its worker continues emitting progress beyond the former wall-clock boundary
    Then the factory uses no five-minute absolute deadline
    And the worker may finish successfully
    And the resettable idle timeout remains 120 seconds
    And completion still requires a valid assessment and human acceptance

  Scenario: MC-04 Remove startup compaction caused by a stale display catalogue
    Given the display catalogue has a stale smaller context capacity
    And the selected provider and model have a larger effective local Pi capacity
    When a readiness session starts without a manual catalogue scan
    Then readiness reads current SDK limits without contacting a model
    And evidence below the current 50 percent threshold is not compacted
    And the display catalogue is not mutated
    And genuine 50 and 80 percent safeguards remain enforced for all approved routes
