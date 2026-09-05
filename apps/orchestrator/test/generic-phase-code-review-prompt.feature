Feature: Generic independent phase-review composition
  Runtime identity is bound to separately owned review policies without inferring behavior from phase names.

  Scenario: A baseline phase review is composed
    Given an arbitrary phase, branch, canonical scope, and artifact identity
    When the independent review prompt is rendered
    Then scope, finding, adjudication, result, and manifest policies appear in order
    And project context does not become review authority

  Scenario: A repeated stable finding needs a bounded plan
    Given an arbitrary finding exhausted the normal fix-review cycle
    When the remediation-plan review is composed
    Then the existing identity and complete acceptance matrix are required
    And normal manifest binding remains unchanged

  Scenario: Previous review context is available
    Given an arbitrary review has durable follow-up evidence
    When the prompt is composed
    Then that evidence is appended after immutable runtime identity
    And the reviewer remains non-mutating
