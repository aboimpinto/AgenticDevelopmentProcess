Feature: Generic authoritative review-contract repair
  A rejected serialized review can be conformed to its schema without changing the independent review decision.

  Scenario: A baseline review draft violates the V1 contract
    Given exact authoritative scope, artifact identity, schemas, catalog, and safe validator rejection
    When the repair prompt is composed
    Then only representation fields needed for conformance may change
    And exactly one raw JSON object is returned without lineage

  Scenario: A rerun draft violates the V1 contract
    Given the immutable predecessor reference is available
    When the repair prompt is composed
    Then the exact lineage object is copied without alteration
    And the existing findings, result, and substantive decisions remain unchanged

  Scenario: The active architecture catalog is unavailable
    Given mandatory schemas are readable but no optional catalog exists
    When repair sources are loaded
    Then the catalog is represented as unavailable
    And no active-rule authority is invented
