Feature: Generic feature-workflow target resolution
  Workflow commands resolve current work-item state before applying command-specific readiness rules.

  Scenario: Marker-free changes do not require another Deep-Dive
    Given a readable generic feature has no validation markers and historical stale evidence
    When the production target resolver evaluates preparation and implementation
    Then the feature is returned for both workflow paths

  Scenario: Cancellation can target any running work-item kind
    Given a generic EPIC or feature is present in the current project scan
    When the production target resolver evaluates cancellation
    Then the matching work item and project are returned without feature-only validation
