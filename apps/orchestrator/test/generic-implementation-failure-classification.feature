Feature: Generic implementation failure classification
  Workflow recovery is selected from stable failure categories instead of work-item identities.

  Scenario: Recoverable operational failures are recognized
    Given a worker, provider prompt refusal, review, validation, timeout, command-safety, or local-tooling failure occurs
    When the generic implementation failure classifier evaluates it
    Then the failure is eligible for the appropriate recovery path

  Scenario: Authoritative review contract failures remain distinct
    Given a review contract or fixer-response boundary rejects a transition
    When the generic implementation failure classifier evaluates it
    Then its exact contract category remains available to the orchestrator

  Scenario: Recovery phase identity is extracted from generic evidence
    Given a failure brief identifies a blocked or failed numbered phase
    When the generic implementation failure classifier evaluates it
    Then the relevant phase number is returned without inspecting the phase title
