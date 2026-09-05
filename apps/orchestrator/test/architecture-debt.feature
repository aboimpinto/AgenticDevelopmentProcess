Feature: Authoritative architecture-debt governance

  Scenario: E013-AD-001 persists immutable evidence as a deduplicated pending-triage record
    Given an exact persisted approved manifest and debt observation for one workflow scope
    When the public ingestArchitectureDebtObservation boundary admits the observation
    Then ArchitectureDebtSqliteStore commits one PENDING_TRIAGE aggregate with provenance-bearing defaults
    And a second exact-key observation links to that aggregate without creating another record
    And malformed, mismatched, stale, or failed requests leave no partial architecture-debt rows
    And restart reconstruction returns the same aggregate from append-only rows

  Scenario: E013-AD-002 permits only verified architecture-steward triage and future-touch decisions
    Given a reconstructed architecture-debt aggregate and independently resolved architecture-steward authority
    When the public evaluateArchitectureDebtTriage and evaluateFutureTouch boundaries evaluate a V1 action or decision
    Then every permitted lifecycle transition and complete REMEDIATE, PREREQUISITE, WAIVER, or NON_INTERACTION decision has an exact bound result
    And malformed authority, stale or foreign identity, invalid transitions, incomplete evidence, and cross-kind decision fields return sanitized refusals without an accepted event or match

  Scenario: E013-AD-003 renders an authoritative register as one-way safe Markdown
    Given reconstructed architecture-debt aggregates from authoritative structured state
    When the public projectArchitectureDebtRegister and renderArchitectureDebtMarkdown boundaries are invoked
    Then every allowlisted record field is rendered deterministically without raw evidence, artifacts, authority, or actions
    And malformed, identity-mismatched, hostile, and raw-aggregate renderer input returns only a sanitized refusal
    And the resulting Markdown cannot be parsed or used to reconstruct or mutate architecture-debt state

  Scenario: E013-AD-004 refuses readiness until a persisted future-touch decision covers every matched debt selector
    Given a refined feature has a valid ArchitectureDebtTouchPlan.json that matches open architecture debt
    When the public evaluateFeatureDebtReadiness boundary evaluates the real structured plan and SQLite decisions
    Then missing, stale, foreign, partial, or expired decision evidence returns no Ready To Develop promotion and no approved debt context
    And one persisted current REMEDIATE, PREREQUISITE, WAIVER, or NON_INTERACTION decision per matched record permits only bounded safe context

  Scenario: E013-AD-005 keeps discovery review gate-neutral while later refinement enforces matching debt decisions
    Given immutable debt observation ingress recorded untouched historical debt for an approved discovery review
    When a later refined feature touches that open debt without a persisted current decision
    Then the discovery review remains approved and only the later feature readiness is denied
