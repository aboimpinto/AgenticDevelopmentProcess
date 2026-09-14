Feature: Generic RefineFeature artifact contract

  Background:
    Given an arbitrary clarified feature is being refined
    And promotion uses the shared refinement artifact validator
    And no feature-specific phase count, suffix, title, or task exception is configured

  Scenario: A complete generic refinement handoff is accepted
    Given all contract-declared planning and phase artifacts exist
    And ArchitectureDebtTouchPlan.json is valid and belongs to the selected project and feature
    When RefineFeature validates the handoff before promotion
    Then artifact validation succeeds
    And StartFeature may consume the same ready handoff

  Scenario: New refinement authoring requires the current phase contract
    Given the worker emits a structurally readable historical phase execution contract
    When RefineFeature validates the handoff before promotion
    Then artifact validation fails with OBSOLETE_PHASE_EXECUTION_CONTRACT
    And historical implementation can still read that contract without treating it as new authoring

  Scenario: Legitimate phase progress preserves continuation readiness
    Given a valid refined feature has entered implementation
    And a contract task is checked, its phase is IN_PROGRESS, and its gates contain evidence
    When the generic execution artifact interface is validated
    Then the durable refinement interface remains valid
    And Continue Implementing remains available

  Scenario: Contract inventory remains authoritative during continuation
    Given a current execution contract declares arbitrary ordered phase documents
    And FeatureTasks contains its Contract ID, Document, Role, and Status inventory
    But a historical Phase and Status projection appears earlier in the same section
    When the generic execution artifact interface is validated
    Then the contract inventory is selected by its schema
    And Continue Implementing is not hidden by the historical projection

  Scenario: Refinement-only satellite damage does not strand implementation
    Given a feature already has a valid execution contract and unresolved phase work
    But a refinement-only architecture-debt or planning satellite is missing or malformed
    When the generic implementation continuation interface is validated
    Then Continue Implementing remains available
    And the satellite diagnostic remains visible without becoming execution authority

  Scenario: A malformed execution contract still blocks continuation
    Given an in-progress feature has unresolved phase work
    But its authoritative phase execution contract is missing or malformed
    When the generic implementation continuation interface is validated
    Then Continue Implementing is unavailable
    And the exact execution-contract diagnostic explains the manual blocker

  Scenario: A valid plan with no matching debt needs no steward ceremony
    Given ArchitectureDebtTouchPlan.json is valid for the selected project and feature
    And none of its selectors match open architecture debt
    And no architecture steward is configured
    When RefineFeature evaluates architecture-debt readiness
    Then the feature is ready with an empty bounded debt context
    And StartFeature does not repeat the refinement readiness ceremony

  Scenario: A missing touch plan blocks promotion
    Given all other refinement artifacts are valid
    But ArchitectureDebtTouchPlan.json is absent
    When RefineFeature validates the handoff before promotion
    Then artifact validation fails with MISSING_ARCHITECTURE_DEBT_TOUCH_PLAN
    And the feature is not declared ready

  Scenario: A malformed touch plan blocks promotion
    Given all other refinement artifacts are valid
    But ArchitectureDebtTouchPlan.json is not a canonical V1 structured touch plan
    When RefineFeature validates the handoff before promotion
    Then artifact validation fails with INVALID_ARCHITECTURE_DEBT_TOUCH_PLAN
    And the feature is not declared ready

  Scenario: A foreign touch plan blocks promotion
    Given all refinement artifacts are structurally valid
    But ArchitectureDebtTouchPlan.json names a different project or feature
    When RefineFeature validates the handoff before promotion
    Then artifact validation fails with ARCHITECTURE_DEBT_TOUCH_PLAN_IDENTITY_MISMATCH
    And the feature is not declared ready

  Scenario: A declared final checkpoint uses logical acceptance assessment
    Given the accepted workflow declares a final checkpoint
    When refinement prepares its final verification task
    Then its required full verification remains declared
    And its test coverage assessment compares assertions with acceptance criteria
    And no numeric coverage measurement row or percentage target is required

  Scenario: Missing numeric instrumentation does not require Deep-Dive
    Given a project has configured build, lint and test commands
    But no numeric coverage command or LCOV report
    When refinement validates its final checkpoint artifacts
    Then numeric instrumentation is not a promotion prerequisite
    And no coverage-setup questions are required merely because instrumentation is absent

  Scenario: Valid project coverage configuration is reused
    Given the project-owned final verification profile already contains valid coverage checks
    When another arbitrary feature with a final checkpoint is refined
    Then RefineFeature reuses the project coverage configuration
    And it does not ask the user the coverage-setup questions again

  Scenario: Document metadata remains readable after introductory sections
    Given a feature or phase document with an explicit feature-identified status block
    And introductory sections appear before that metadata block
    When implementation artifacts are validated
    Then the declared document status is read without changing the document
    And nested task, quoted, commented and example statuses cannot supply its lifecycle authority
