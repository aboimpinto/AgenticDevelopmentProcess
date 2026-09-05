@EPIC-011 @FEAT-071 @integration
Feature: Portable skills and explicit orchestrated model authority
  As a Hepha user
  I want each execution mode to have one model authority
  So that direct skills preserve the host model and orchestrated workers use the registered route

  @E011-LAUNCH-003
  Scenario: Direct Code Review preserves the active Pi model
    Given a direct Pi session whose model differs from the Hepha Code Review route
    When the user invokes the portable Code Review procedure in that session
    Then the procedure performs no policy read, model switch, nested transfer, or orchestrated receipt write

  @E011-LAUNCH-005
  Scenario: Portable direct skills preserve the selected Pi Codex and Claude Code models
    Given one model-neutral Start Feature procedure is available to Pi Codex and Claude Code
    When each host invokes the procedure directly
    Then each invocation remains in its host without route selection or an orchestrated receipt

  @E011-ASSET-003
  Scenario: Orchestration injects the explicit Start Feature route without changing the skill
    Given an explicit Start Feature action resolves to a route different from the Pi installation default
    When the orchestrated specialist runs the unchanged portable skill through the plan-bound Pi adapter
    Then Pi receives the resolved provider and model while the skill receives no route or credential authority

  @E011-ASSET-001
  Scenario: Managed assets reject embedded routing choices
    Given the production workflow, command, agent, and lifecycle-skill inventories
    When Hepha validates their model-authority contract
    Then no managed asset contains provider model model ID or model-policy routing fields
    And every orchestrated worker node maps to exactly one registered action ID

  @E011-ASSET-002
  Scenario: Claude Code skill frontmatter cannot override the direct session model
    Given a Hepha lifecycle skill is available to Claude Code
    When the portable skill contract is validated
    Then its frontmatter omits model and routing effort overrides
    And direct invocation inherits the active Claude Code session model

  @E011-ASSET-004
  Scenario: Direct execution records no actual model without trusted instrumentation
    Given a direct Codex procedure completes state sync without trusted model instrumentation
    When Hepha records and projects its route-free direct-host evidence
    Then Details identify direct-host execution with Not recorded model evidence and no policy route

  @E011-SAFE-001
  Scenario: Action admission rejects missing unknown and conflicting action before route resolution
    Given a dispatch envelope arrives with a missing unknown or conflicting agent_action
    When the action admission guard validates the envelope before route resolution
    Then no Pi worker is spawned and no policy route is resolved
