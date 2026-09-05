Feature: Generic post-worker phase validation
  Every phase worker return must preserve a valid phase document and its declared durable outputs.

  Scenario: An ordinary phase returns valid durable state
    Given a worker completed a non-planning phase
    When the phase template remains valid
    Then the phase may continue to its next declared transition

  Scenario: A declared planning phase omits its artifact
    Given a phase contract declares a planning responsibility
    When its worker returns without the required planning artifact
    Then the phase is blocked with the exact artifact failure

  Scenario: A recovery phase reaches its explicit boundary
    Given a phase worker records recovery completion
    When its durable output passes validation
    Then the current run stops at the recovery boundary for a normal continuation
