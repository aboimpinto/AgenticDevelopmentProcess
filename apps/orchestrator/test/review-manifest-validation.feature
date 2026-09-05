Feature: Review manifest validation
  A manifest becomes authoritative only after its findings form a coherent bounded decision.

  Scenario: A complete manifest binds every finding to active authority
    Given each finding declares a valid disposition and authority
    And every referenced rule snapshot matches the active catalog
    When the manifest is validated
    Then a deterministic manifest projection is returned

  Scenario: Code surfaces cannot contradict themselves
    Given one surface identifier is both affected and confirmed unaffected
    When the finding surface is validated
    Then the contradictory surface is rejected

  Scenario: Blocking findings carry complete remediation evidence
    Given a blocking finding declares affected and inspected surfaces
    When its disposition obligations are validated
    Then root cause remediation tests exhaustiveness and compatibility are required

  Scenario: An approved result contains no unresolved blocker
    Given a manifest declares an approved result
    And one finding remains blocking
    When the manifest is validated
    Then the inconsistent decision is rejected
