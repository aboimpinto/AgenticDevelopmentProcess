Feature: Generic phase review-resume planning
  Raw phase, report, task, and authoritative evidence selects one normal review lifecycle route.

  Scenario: Work first reaches its declared review task
    Given every preceding task is complete and review is required
    When the phase review-resume plan is calculated
    Then the independent baseline reviewer is selected
    And historical findings from no-review work are ignored

  Scenario: A reviewer requests changes
    Given the newest applicable review has durable findings and no successor handoff
    When the phase review-resume plan is calculated
    Then the normal fixer route is selected
    And the phase does not advance

  Scenario: Fixer evidence requests an independent rerun
    Given a rerun marker, remediation response, or verification receipt is durable
    When the phase review-resume plan is calculated
    Then the independent reviewer is selected again
    And no fixed retry-cycle count changes the route

  Scenario: A newer reviewer decision is durable
    Given the newest authoritative manifest is approved or blocked
    When the phase review-resume plan is calculated
    Then approval selects phase exit and blocked selects the terminal blocked path
    And stale report or rerun markers cannot override that decision

  Scenario: A phase whose next ordered task is code-review does not also await a rerun
    Given every preceding task is complete and review is required
    And the next ordered task is code-review
    And unrelated session text contains a rerun marker
    When the phase review-resume plan is calculated
    Then the independent baseline reviewer is selected
    And the rerun flag is false
