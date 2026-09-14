Feature: Workflow position formatting

  Scenario: Running refinement workflow position and trace are shown once in Workflow Readiness
    Given a FEAT has an active refine-feature run
    And the workflow position has a running state, active phase, missing quality gate, and stale Deep-Dive
    When the Work Board renders the FEAT detail page
    Then the workflow-position synopsis is not shown above Source Document
    And Run Trace is not shown above Source Document
    And Workflow Readiness contains a workflow-position card for the active run
    And Workflow Readiness contains a Run Trace card for the latest run
    And the workflow-position card shows Command, State, Phase, and Quality Gate as separated detail rows
    And Deep-Dive status is shown only by the existing Hepha Deep-Dive readiness tile

  Scenario: Artifact diagnostics and completion gaps keep a readable phase layout
    Given a phase with both artifact diagnostics and completion coverage gaps
    When it is displayed on a desktop or narrow screen
    Then its title remains readable beside its lifecycle status
    And recovery content occupies the full available width below the heading

  Scenario: Uncertain phase findings expose an explicit repair action
    Given a completed phase has uncertain assertion mappings and separate coverage awaiting confirmation
    When the user clicks Investigate and fix phase findings
    Then the request targets the owning phase with repair authority
    And coverage confirmation remains a separate user decision
