Feature: Generic phase worker terminal result

  Background:
    Given a worker is executing an arbitrary phase from the ordered phase contract
    And the executor has no feature, phase-number, phase-title, task, or report-path exception

  Scenario: A transient provider error is superseded inside the same attempt
    Given the worker emits a terminal provider error
    And the same worker process later emits a successful terminal assistant message with output
    And the worker process exits successfully
    When the generic phase executor resolves the worker result
    Then it accepts the final worker output
    And it does not route the phase through failure recovery

  Scenario: A terminal provider error remains a failure
    Given the worker emits useful partial output
    But its latest terminal assistant message is a provider error
    And the worker process exits successfully
    When the generic phase executor resolves the worker result
    Then it fails the attempt with the terminal provider error

  Scenario: Process failure cannot be hidden by worker output
    Given the worker emits a successful terminal assistant message with output
    But the worker process exits unsuccessfully
    When the generic phase executor resolves the worker result
    Then it fails the attempt with the process error
