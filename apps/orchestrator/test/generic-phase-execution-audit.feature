Feature: Generic phase execution audit
  Operational phase telemetry is append-only and excludes worker content and secrets.

  Scenario: Phase progress is audited
    Given an arbitrary phase transition occurs
    When the audit writer receives its operational fields
    Then one JSON line is appended with the phase and workflow identity
    And no prompt, worker output, tool arguments, or credentials are recorded

  Scenario: Pi attempts share the same audit stream
    Given an arbitrary worker attempt starts and finishes
    When both operational events are audited
    Then both JSON lines remain ordered in the phase execution log
