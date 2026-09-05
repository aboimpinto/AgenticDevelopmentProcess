Feature: Generic phase git checkpoint application
  The orchestrator keeps version-control publication separate from phase correctness.

  Scenario: Commit and push complete after the phase exit gate
    Given an arbitrary phase has completed every declared task and exit gate
    When its declared git checkpoint commits, pushes, and verifies the feature branch
    Then the workflow records the checkpoint summary
    And phase execution may continue

  Scenario: Git publication is temporarily unavailable
    Given an arbitrary phase has completed every declared task and exit gate
    When its git checkpoint cannot commit or push
    Then the application records a resumable checkpoint
    And it does not report the implementation phase as failed
