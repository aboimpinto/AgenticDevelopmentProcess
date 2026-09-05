Feature: Generic atomic immutable-review ingestion
  Validated artifact aggregates are bound, persisted, and verified as one transaction.

  Scenario: References are bound before transaction work
    Given a canonical review artifact has lineage and aggregate references
    When the ingest repository resolves its dependencies
    Then every reference must match an existing exact-scope immutable identity

  Scenario: One aggregate commits as one unit
    Given canonical validation and all dependency checks succeed
    When the ingest transaction writes artifact and derived evidence rows
    Then all owned rows commit together

  Scenario: Durable disagreement rolls back every row
    Given any inserted artifact, lineage, run, finding, lifecycle, or receipt row disagrees on read-back
    When the ingest transaction verifies its durable aggregate
    Then the complete transaction fails without partial evidence

  Scenario: The public store remains a compatibility facade
    Given callers use the stable immutable-review ingest method
    When they submit an aggregate
    Then the facade delegates persistence ownership to the ingest repository
