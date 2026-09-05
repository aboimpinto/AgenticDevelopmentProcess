Feature: Generic immutable review artifact queries
  Artifact content, provenance, and lineage are read through one bounded repository.

  Scenario: An artifact is read by its content identity
    Given immutable review evidence exists for a content hash
    When the artifact repository reads that hash
    Then the complete stored artifact projection is returned

  Scenario: Artifacts are isolated to an exact review scope
    Given multiple artifacts and review scopes exist
    When artifacts are listed for one exact scope
    Then only matching artifacts are returned newest first

  Scenario: Manifest provenance is available
    Given a manifest created an immutable review run
    When the run is read through its manifest hash
    Then workflow and invocation provenance are returned

  Scenario: Artifact lineage is deterministic
    Given an artifact references predecessor evidence
    When lineage is listed for that artifact
    Then relations are ordered by kind and predecessor hash
