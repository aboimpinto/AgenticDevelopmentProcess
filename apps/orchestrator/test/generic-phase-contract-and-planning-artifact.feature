Feature: Generic phase contract and planning artifact policy
  Phase behavior follows the declared execution contract and durable handoff evidence rather than phase names.

  Scenario: A phase document has a declared execution role
    Given a valid execution contract references the phase document
    When its execution policy is requested
    Then the role and ordered obligations come from that contract entry

  Scenario: A refined work item omitted its execution contract
    Given refinement is expected to provide a contract
    When no valid contract can be loaded
    Then execution is denied with the contract diagnostics

  Scenario: A planning phase writes its durable handoff under the phase folder
    Given a non-empty historical planning artifact exists
    When the planning handoff is resolved
    Then that existing artifact remains authoritative

  Scenario: A contract declares Git publication for selected phases
    Given some phases require a Git checkpoint and others do not
    When missing checkpoints are counted
    Then only required unsatisfied checkpoints are reported
