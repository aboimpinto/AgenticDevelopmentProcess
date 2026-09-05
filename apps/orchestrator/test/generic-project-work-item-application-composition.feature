Feature: Generic project and work-item application composition
  Project discovery, work-item projection, relationship synchronization, and manual verification share one query boundary.

  Scenario: A project work-item collection is read
    Given a registered project has MemoryBank work items
    When the query application scans the configured state folders
    Then validation and workflow summaries decorate the scanned cards
    And relationship hydration remains delegated

  Scenario: A feature relationship changes
    Given a feature is linked to a parent work item
    When the relationship application applies the change
    Then current work items are rescanned
    And parent state synchronization uses the shared query boundary

  Scenario: Manual verification completes
    Given implementation phases are durably resolved
    When manual verification records its result
    Then completion may start through the injected completion boundary
    And artifact resolution uses the same registry and query boundary
