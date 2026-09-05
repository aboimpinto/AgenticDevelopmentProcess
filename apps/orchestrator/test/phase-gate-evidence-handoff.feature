Feature: Generic phase quality-gate evidence handoff
  The generic phase executor requires explicit observed results and never
  converts non-empty failure prose into successful gate evidence.

  Scenario: A failed Playwright result blocks phase completion
    Given a phase worker reports the Playwright result as failed
    When the orchestrator applies the phase evidence handoff
    Then the Gherkin/Playwright E2E gate remains missing
    And the active phase task is not completed
    And the same phase is dispatched again for repair

  Scenario: Repeated failed evidence remains an idempotent repair result
    Given the same failed validation evidence is already persisted
    When the next repair worker reports that same failed validation evidence
    Then the evidence handoff remains valid
    And the active phase is dispatched again instead of failing the workflow

  Scenario: Passed browser verification satisfies the gate
    Given a phase worker reports the Playwright result as passed
    When the orchestrator applies the phase evidence handoff
    Then the Gherkin/Playwright E2E gate is satisfied

  Scenario: Explicit non-applicability settles a non-browser phase
    Given a phase worker reports Playwright as not_applicable with justification
    When the orchestrator applies the phase evidence handoff
    Then the Gherkin/Playwright E2E gate is not applicable

  Scenario: Legacy evidence-only handoffs fail closed
    Given a phase worker omits explicit gate results
    When the orchestrator parses the phase evidence handoff
    Then the worker result is rejected before task completion
