Feature: Simple generic reviewed phase transitions
  The Phase Executor is an application service that routes from durable review
  evidence without inventing workflow state from history or feature details.

  Scenario: A reviewer crash after a durable fixer handoff resumes the reviewer
    Given a review manifest requested changes
    And the fixer response and verification receipt are durable
    When the generic phase executor resumes
    Then the next worker is the independent reviewer
    And no duplicate fixer proposal is requested

  Scenario: A fixer response without its receipt resumes evidence recovery
    Given a review manifest requested changes
    And only the fixer response is durable
    When the generic phase executor resumes
    Then the next worker is the fixer on the same declared review task
    And the independent reviewer is not started yet

  Scenario: A reviewer can request another fixer cycle
    Given the independent reviewer evaluated the current implementation
    And the reviewer emitted a newer needs-changes manifest
    And the earlier independent-rerun marker is still present
    When the generic phase executor resumes
    Then the next worker is the fixer
    And the fixer's durable handoff routes back to the independent reviewer

  Scenario: A committed approval resumes at phase exit
    Given an approved review manifest is durable
    And its exact-scope authoritative gate is terminal approved
    And the prior human-readable report still requests changes
    When the generic phase executor resumes
    Then no implementation, fixer, or reviewer worker is started
    And the authoritative phase-exit checkpoint is evaluated

  Scenario: Repeated remediation does not invent a replan transition
    Given successive reviews request additional changes
    When the generic Phase Executor selects the next transition
    Then the next worker is the fixer
    And no report history, fingerprint, or recurrence counter changes that transition

  Scenario: Earlier phases do not consume a later phase review budget
    Given an earlier phase required several legitimate fixer and reviewer cycles
    And the current phase has a newer needs-changes manifest
    When the generic Phase Executor selects the next transition
    Then the next worker is the fixer
    And no workflow-wide retry limit stops the reviewed phase

  Scenario: An invalid fixer handoff is repaired in the same run
    Given the fixer completed its implementation and verification work
    And its successor handoff differs from the immutable predecessor reference
    When the generic Phase Executor validates the handoff
    Then no invalid successor artifact is persisted
    And the same phase fixer receives the exact mismatching field
    And the independent reviewer is not started yet

  Scenario: A same-run handoff repair keeps its authoritative identities
    Given the generic Phase Executor assigned response and receipt identities
    And the first fixer handoff is invalid
    When the same logical remediation chain retries
    Then the response and receipt identities are unchanged
    And a corrected handoff can persist before the independent reviewer starts

  Scenario: A blocked review stops the current run
    Given the latest durable review manifest is blocked
    When the generic Phase Executor resumes
    Then the workflow stops blocked
    And no different worker is inferred
