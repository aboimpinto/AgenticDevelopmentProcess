Feature: Generic authoritative review manifest
  Every independent review emits one canonical V1 artifact bound to the exact invocation and scope.

  Scenario: A baseline review emits a manifest
    Given an arbitrary review invocation has an assigned artifact identity
    When the reviewer returns its result
    Then exactly one raw versioned manifest is emitted
    And no predecessor lineage is invented

  Scenario: A remediation rerun emits a successor manifest
    Given an arbitrary persisted predecessor is authoritative
    When the independent reviewer reruns the review
    Then the exact predecessor reference is copied unchanged
    And the new artifact keeps its separately assigned identity

  Scenario: Canonical feature identity is unavailable
    Given an arbitrary display identity cannot be resolved to canonical scope
    When the manifest contract is rendered
    Then an invalid-scope sentinel is used
    And the display identity is not silently accepted
