Feature: Generic work-item query boundary
  MemoryBank cards remain readable even when optional workflow metadata is unavailable.

  Scenario: Optional metadata failure preserves filesystem work items
    Given a project contains valid generic MemoryBank work items
    And optional metadata reconciliation is unavailable
    When the production work-item query application scans the project
    Then every filesystem work item is returned in lifecycle order
    And metadata-backed workflow projections are marked unavailable
    And the storage failure is reported without failing the scan
