Feature: Generic implementation automatic recovery
  Scenario: A terminal recovery policy failure is received
    Given a failure that policy forbids from retrying
    When automatic recovery evaluates it
    Then no mutable workflow state or worker is used

  Scenario: Code-review findings require fixes
    Given an authoritative review finding transition
    When automatic recovery evaluates it
    Then the bounded fixer retry runs without a generic recovery agent

  Scenario: The fixer process was terminated
    Given an incomplete finding resolution process
    When automatic recovery evaluates its termination
    Then no code-review rerun is started

  Scenario: A provider refuses the accumulated worker prompt
    Given a worker session has been rejected by the model provider
    When automatic recovery evaluates the refusal
    Then the same durable task is retried once in a fresh worker session
    And a repeated refusal stops without an automatic loop

  Scenario: Host-side repair authorizes a retry
    Given a recoverable host condition
    When the host repair succeeds
    Then the implementation retry runs without a recovery agent

  Scenario: Host-side repair cannot proceed
    Given a host condition that cannot be repaired
    When automatic recovery evaluates it
    Then the host failure brief remains authoritative

  Scenario: Recovery analysis denies retry
    Given a failure requiring recovery analysis
    When analysis denies a retry and policy cannot authorize it
    Then the analyzed failure is returned without retry

  Scenario: Recovery analysis modified machine-owned state
    Given a recovery worker changed protected workflow state
    When the host restores that state and retries

  Scenario: No recovery worker is dispatched for a phase whose derived state is COMPLETED
    Given a previous phase failure due to a stale status field
    And all phase tasks are checked
    And the code review is approved
    When automatic recovery evaluates it
    Then no recovery worker or retry is started
    Then the restoration guard is included in retry evidence
