Feature: Generic implementation recovery application composition
  Host repair, recovery-agent analysis, machine-state protection, and bounded retry share one recovery graph.

  Scenario: A known host failure is repaired
    Given an implementation failure has a recognized host-side recovery
    When autonomous recovery evaluates the failure
    Then the host repair runs before any recovery agent
    And retry remains bounded by the recovery application

  Scenario: An unknown recoverable failure is analyzed
    Given an autonomous workflow has a recoverable failure
    When the recovery agent inspects current evidence and lessons
    Then machine-owned workflow state is restored after analysis
    And only an explicit retry result permits another attempt

  Scenario: A fatal workflow failure is received
    Given the failure violates an authoritative review or repair contract
    When recovery classifies the failure
    Then no autonomous retry is launched
    And the final failure remains authoritative
