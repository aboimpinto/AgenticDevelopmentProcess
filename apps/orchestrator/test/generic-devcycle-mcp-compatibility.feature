Feature: Generic DevCycle MCP recipe-source compatibility
  A workflow action may use the proven MCP recipe or the native Hepha implementation without changing its model-routing identity.

  Scenario: Native Hepha remains the default
    Given no compatibility recipe source is configured
    When a supported feature workflow action is selected
    Then the native Hepha application owns execution

  Scenario: MCP compatibility uses one selected model
    Given the DevCycle MCP recipe source is configured
    When a supported feature workflow action is selected
    Then the action remains available from its lifecycle folder without native artifact gates
    And one MCP-enabled worker calls the mapped recipe tool
    And the same worker executes the returned procedure locally

  Scenario: MCP implementation telemetry stays phase-scoped
    Given the DevCycle MCP recipe source is configured for implementation
    And one implementation phase is unresolved
    When the orchestrator dispatches the mapped provider worker
    Then the worker execution is attributed to that unresolved phase
    And the orchestrator command model is recorded separately from observed runtime routing

  Scenario: MCP refinement without completed artifacts becomes a Deep-Dive recovery
    Given the DevCycle MCP refinement worker exits successfully
    But the feature remains outside Ready To Develop without complete refinement artifacts
    When the orchestrator evaluates the provider-independent postconditions
    Then refinement is blocked at result evaluation instead of recorded complete
    And the dashboard offers the normal interactive FEAT Deep-Dive
    And retrying Refine is withheld until that decision round completes

  Scenario: MCP refinement cannot defer autonomous decisions to human gates
    Given the DevCycle MCP recipe source is configured for refinement
    And target Deep-Dive decisions are complete
    When the mapped recipe publishes refinement artifacts
    Then human sign-off and owner-attestation tasks are rejected
    And implementation review and phase acceptance remain autonomous

  Scenario: MCP refinement discovers commands without executing product tooling
    Given the DevCycle MCP recipe source is configured for refinement
    And project manifests and lockfiles describe the implementation toolchain
    When the mapped recipe prepares the implementation plan
    Then stack and quality commands are discovered statically
    And no package-manager compiler build test lint audit registry-search or version-probe command executes
    And no product implementation repository is mutated

  Scenario: Refinement conditionally activates foreground Cargo execution
    Given the target product workspace contains Cargo.toml
    And the feature or configured quality gates will invoke Cargo
    When the DevCycle MCP recipe refines the feature
    Then FeatureTasks and every phase inherit the Cargo foreground execution profile
    And sequential Cargo invocations are permitted
    But background and sibling concurrent Cargo processes are prohibited

  Scenario: External release findings do not block implementation completion
    Given every in-scope task and configured executable gate is green
    And an external release dependency remains unresolved
    When the mapped implementation worker evaluates the final checkpoint
    Then the phase and feature implementation are completed
    And release readiness records the external dependency separately
    And Lessons Learned recommends follow-up epic or feature work

  Scenario: Non-Cargo implementation receives no Cargo recommendation
    Given Cargo activation evidence was not recorded during refinement
    When the mapped implementation worker executes a phase
    Then implementation dispatch applies only inherited stack-specific constraints
    And it does not invent Cargo instructions
    And every configured warning remains red even when its command exits successfully

  Scenario: Invalid configuration fails before workflow execution
    Given a configured recipe source is not recognized
    When runtime configuration is constructed
    Then construction fails without selecting an action or starting a worker
