Feature: Generic work-management boundaries
  Project, work-item, and workflow data must cross cohesive contracts without moving behavior into shared transport.

  Scenario: List work items for a registered project
    Given a project registry entry and scanned work items exist
    When the work-item list is returned
    Then project, scan, validation, and relation data use their bounded contracts

  Scenario: Report workflow and manual-verification state
    Given an implementation workflow and verification pack have persisted state
    When their status is presented
    Then runtime, finding, and verification summaries remain serialization safe

  Scenario: Preview and apply an epic change
    Given candidate work items were discovered from an epic
    When a preview plan is returned for confirmation
    Then the plan carries its source hash, warnings, and bounded candidates

  Scenario: Continue a deep-dive or feature relationship operation
    Given an interactive session or relationship request is active
    When the application returns its result
    Then session and linking evidence cross explicit contracts
