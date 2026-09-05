Feature: Generic workflow safety contracts
  Safety evaluators and transport surfaces exchange stable, receipt-safe decisions.

  Scenario: A path action is evaluated
    Given a read or write target is checked against a path profile
    When the path evaluator returns a decision
    Then the shared contract preserves its safe display path, code, and reason

  Scenario: A command is evaluated for concurrent execution
    Given a command has a risk and shared-state classification
    When command and serialization policies return a decision
    Then the shared contract preserves the outcome and conflict evidence

  Scenario: An approval is resolved
    Given a guarded action requires operator confirmation
    When the approval application returns its current state
    Then the shared contract preserves resolution evidence without authority

  Scenario: A Git action is guarded
    Given a local or remote Git action is classified
    When workflow and approval checks produce guardrail evidence
    Then the shared contract preserves the safe action and dirty-state summary
