Feature: Generic work-item card identity
  Runtime metadata uses one stable identity for every supported MemoryBank work-item kind.

  Scenario: A work-item identity uses mixed letter casing
    Given a supported work-item kind and an external identity
    When the runtime card key is created
    Then the kind is preserved
    And the external identity is normalized to uppercase

  Scenario: Different work-item kinds share an external identity
    Given two supported work-item kinds with the same external identity
    When their runtime card keys are created
    Then the resulting keys remain distinct
