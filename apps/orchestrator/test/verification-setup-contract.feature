Feature: Current configuration establishes verification setup
  Scenario: Reinspect a baseline produced under an obsolete setup contract
    Given unchanged source with a bounded test-owned fixture
    And a saved plan under the old contract claims an unrelated external service
    When the user refreshes readiness
    Then the old contract hash invalidates the saved plan
    And inspection reads the current setup and replaces the inherited claim
    And the actual test processes execute and their native evidence reaches assessment
    And human acceptance remains separate

  Scenario: Multiple native reports retain every executed identity
    Given a configured command produces four native suite reports
    When its receipt binds each report with its checksum and aggregate counts
    Then the shared importer retains all four suites
    But a missing or duplicate suite or a changed report cannot establish readiness
