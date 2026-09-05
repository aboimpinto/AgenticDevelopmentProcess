Feature: Generic V1 phase review contract repair
  A completed independent review may repair only its rejected representation before authoritative ingestion.

  Scenario: The review contract is already valid
    Given the independent reviewer returned a valid V1 artifact
    When contract repair is evaluated
    Then no repair worker is launched

  Scenario: The review representation is repairable
    Given safe validation rejects only the contract representation
    When the repair worker returns a corrected draft
    Then the corrected draft is revalidated in the same run
    And the independent review decision is not changed

  Scenario: Repair makes no progress
    Given the repair worker repeats the rejected draft
    When the correction is revalidated
    Then repair stops with a durable rejected result
    And authoritative ingestion is not attempted

  Scenario: Repair reaches its bounded safety limit
    Given every corrected representation remains invalid
    When the bounded repair attempts are exhausted
    Then repair stops without changing review findings or result
