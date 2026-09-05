Feature: Generic implementation evidence projection
  Evidence is assembled from declared artifacts without knowing a feature or phase name.

  Scenario: Declared evidence is merged with auditable source lineage
    Given a work-item folder contains phase, task-ledger, report, and review evidence
    When the production implementation-evidence scanner reads the folder
    Then changed files are deduplicated with every evidence source preserved
    And review and quality-gate projections remain phase scoped
