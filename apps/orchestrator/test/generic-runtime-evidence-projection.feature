@integration @runtime-evidence
Feature: Explicit execution-mode evidence projection
  As a workflow operator
  I want each durable execution authority validated independently
  So that direct-host facts cannot become orchestrated routing facts

  Scenario: Route-free direct state-sync evidence joins the mixed execution projection
    Given a registered work item and route-incapable direct-host evidence
    When the public runtime-evidence application records and reads the phase
    Then the execution is labelled direct host with Not recorded model evidence and no policy route

  Scenario: Cross-mode direct evidence is rejected before persistence and projection
    Given direct-host evidence contains an orchestrated policy field
    When the public runtime-evidence application attempts to record it
    Then the write is rejected and the guarded phase projection remains empty
