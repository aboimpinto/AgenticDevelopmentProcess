Feature: Generic manual-test verification lifecycle
  Manual verification is an application workflow over a resolved work item and its declared sources.

  Scenario: Passing the reviewed verification pack starts eligible completion
    Given a generic work item has resolved implementation phases and a reviewed current pack
    When the production manual-test application records all tests passing
    Then manual-test human review evidence is persisted
    And the refreshed work item is offered to completion exactly once

  Scenario: A completed work item records green verification without finalizing twice
    Given a generic work item is already in the completed lifecycle folder
    And its current reviewed verification pack is authoritative
    When the production manual-test application records all tests passing
    Then manual-test human review evidence is persisted
    And complete-feature finalization is not started again

  Scenario: An unresolved work item cannot generate a verification pack
    Given a generic work item still has unresolved implementation phases
    When the production manual-test application requests pack generation
    Then generation is rejected before the verification adapter is invoked

  Scenario: A non-automatable implementation test becomes mandatory manual verification
    Given the orchestrator selected an implementation task that requires a user-provided physical or manual environment
    When the worker returns a validated manual-test deferral receipt
    Then Hepha records the task as skipped with the canonical reason
    And the complete procedure is persisted as a mandatory Manual TestPack obligation
    And implementation may continue while release readiness remains blocked

  Scenario: A provider refinement cannot publish an orphaned manual-test obligation
    Given a generic provider recipe emits a pending manual-test obligation
    And its task identifier has no unique durable phase-ledger projection
    When Hepha validates the provider refinement handoff
    Then refinement readiness is rejected with a manual-test traceability mismatch
    And Start cannot record or dispatch an implementation workflow
