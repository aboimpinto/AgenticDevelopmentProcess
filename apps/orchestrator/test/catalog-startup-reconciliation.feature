@catalog-reconciliation @backend
Feature: Active provider catalogs reconcile safely at startup
  The orchestrator gives every provider scan one durable claim and never repeats settled startup work.

  Scenario: Existing evidence is adopted while an unscanned active connection is contacted once
    Given two active provider connections predate the reconciliation ledger
    And one connection already has safe model catalog evidence
    When the orchestrator reconciles the current catalog version at startup
    Then the existing evidence is adopted without provider contact
    And the unscanned connection is contacted exactly once through its provider-qualified discovery path
    And a second startup contacts neither settled connection

  Scenario: An interrupted claim fails closed without provider contact
    Given a persisted scan claim was interrupted with stale selectable models
    When the orchestrator reconciles at startup twice
    Then the stale models are cleared and one deterministic safe failure diagnostic is retained
    And no provider contact occurs during interrupted recovery

  Scenario: Contradictory legacy evidence fails closed while future-version state is preserved
    Given legacy model rows conflict with the latest safe failed diagnostic
    And another connection has a settled future reconciliation version
    When the orchestrator reconciles the current catalog version at startup
    Then contradictory stale rows are cleared without provider contact
    And the future-version record is not downgraded or contacted
