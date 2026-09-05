Feature: Generic missing child-feature batch application
  Missing child work is previewed and explicitly confirmed before any MemoryBank mutation.

  Scenario: An explicit child breakdown exists
    Given an eligible parent document contains titled unresolved child rows
    When a missing-feature preview is requested
    Then a deterministic plan is returned without model discovery

  Scenario: The parent has no explicit child breakdown
    Given an eligible parent document has no concrete unresolved child row
    When a missing-feature preview is requested
    Then unnamed discovery may supply grounded candidates

  Scenario: An approved preview becomes stale
    Given the parent source or approved plan hash changed after preview
    When the batch is applied
    Then mutation is denied and a new preview is required

  Scenario: An approved batch is applied
    Given the source, plan, identities, dependencies, and global state remain valid
    When the confirmed candidates are applied
    Then missing child documents are created in dependency order
    And parent projections, counters, state, warnings, and result identities are reconciled

  Scenario: Existing or ambiguous children are encountered
    Given a candidate already exists or appears in conflicting state folders
    When the confirmed batch is classified
    Then existing work is skipped idempotently
    And ambiguous work blocks mutation for manual resolution
