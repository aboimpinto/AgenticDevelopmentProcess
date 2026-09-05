Feature: Generic workflow failure brief presentation
  A retry receives compact actionable evidence without replaying an unbounded workflow transcript.

  Scenario: A workflow failure becomes an actionable brief
    Given a workflow command fails at an identified step
    When the failure brief presenter formats the durable evidence
    Then it records the command, run, cause, recovery, and retry instruction

  Scenario: Review blockers include a bounded decision queue
    Given the latest failure contains authoritative review findings
    When the failure brief presenter formats the durable evidence
    Then it includes the review report and every normalized finding decision

  Scenario: New recovery evidence replaces transient history
    Given a persisted failure brief already contains recovery analysis
    When a newer host or agent recovery decision is recorded
    Then the transient section is replaced while the canonical failure remains
