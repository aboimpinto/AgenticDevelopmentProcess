Feature: Generic phase review gate handoff
  A completed worker must persist the declared review boundary before an independent reviewer is selected.

  Scenario: Completed work reaches baseline review
    Given all durable phase tasks are checked and the review gate is missing
    When the phase requires independent review
    Then awaiting review is persisted and canonical phase state is refreshed

  Scenario: Fixer work is awaiting an independent rerun
    Given review findings were resolved by a fixer
    When the phase already carries its rerun marker
    Then no baseline review handoff is manufactured

  Scenario: The phase contract does not require review
    Given the phase has no declared review obligation
    When its worker completes
    Then no review state is written

  Scenario: The review gate is already settled
    Given checked tasks and settled review evidence
    When review readiness is projected
    Then no duplicate handoff is persisted
