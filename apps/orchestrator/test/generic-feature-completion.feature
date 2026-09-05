Feature: Generic feature completion
  Completion starts only after declared work and transition evidence are satisfied.

  Scenario: Eligible work starts finalization after transition validation
    Given a generic work item has resolved tasks and quality gates
    When the production completion application validates its transition evidence
    Then finalization starts after validation
    And the refreshed project view reports that finalization started

  Scenario: Repeated completion is idempotent
    Given completion finalization is already running
    When completion is requested again
    Then the existing run is reported without starting another finalizer
