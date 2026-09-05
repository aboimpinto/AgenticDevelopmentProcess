Feature: Generic immutable review ingest validation
  Canonical artifact bytes remain the only source of normalized review evidence.

  Scenario: Canonical bytes bind every persistence identity
    Given one current-contract review artifact and matching transport metadata
    When the ingest validator normalizes the request
    Then its hash, scope, path, and artifact identity agree exactly

  Scenario: Current catalog authority is independently resolved
    Given a review artifact cites active architecture rules
    When its snapshots are checked before persistence
    Then every cited snapshot exactly matches the construction-time catalog

  Scenario: Normalized evidence is derived rather than authored
    Given canonical findings and lineage exist in the artifact bytes
    When a caller supplies compatibility-shaped derivatives
    Then only exact mirrors are accepted and canonical derivatives are returned

  Scenario: Invalid input cannot reach database work
    Given malformed, non-canonical, unsafe, oversized, or inconsistent input
    When the validation boundary evaluates it
    Then it returns one sanitized refusal before the store begins a transaction

  Scenario: Verification evidence uses the contract free-text boundary
    Given a schema-valid verification receipt contains explanatory evidence
    When the ingest validator projects that evidence into immutable storage
    Then text through the contract maximum is accepted
    And identifier limits are not applied to free-text evidence
