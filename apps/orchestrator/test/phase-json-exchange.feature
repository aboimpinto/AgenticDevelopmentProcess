Feature: Phase-specific JSON exchange rules
  Scenario: Documentation completion needs no invented test execution
    Given an admitted planning phase only changes documentation
    When its declared tasks complete
    Then the host records JSON not-applicable test evidence
    And the phase can continue without test, build or lint execution

  Scenario Outline: Checkpoint health is independent of production edits
    Given a declared <role> phase with no production changes
    When the host executes the configured build, lint and real test processes
    Then their JSON exchange is consumed directly by the phase quality scanner
    And passing health checks allow continuation without a code review requirement
    Examples:
      | role |
      | entry_gate |
      | final_checkpoint |

  Scenario: A build warning remains a real failed health check
    Given an unchanged checkpoint whose build exits zero but emits a warning
    When the host records its actual execution
    Then the JSON build result retains the warning evidence without blocking phase continuation

  Scenario: Representation defects never become missing-test guesses
    Given a phase has migrated to JSON verification evidence
    When its JSON is malformed or missing but its Markdown says passed
    Then continuation reports the JSON protocol defect
    And no legacy prose fallback supplies success

  Scenario: Optional audit failures preserve execution
    Given a checkpoint has passing host execution evidence
    When obtaining the audit timestamp fails
    Then the persisted JSON is valid without the timestamp or runId
    And its phase quality decision is unchanged

  Scenario: Development revises independent applicability declarations
    Given a phase of any role has a required review and no required verification
    When the host records automatic not-applicable verification
    Then only its review obligation remains unresolved
    When development removes that review obligation with a scope reason
    Then the next scan has no missing gates
    When development adds a required verification task
    Then the former not-applicable result no longer satisfies the phase

  Scenario: Configured integration acceptance does not imply a browser obligation
    Given a phase changes UI code and declares a controlled client-service check
    When the host executes that check successfully
    Then phase acceptance has no invented browser or review obligation
    But an explicitly declared browser gate still requires its own evidence
