Feature: Correct manual test proposals without manufacturing evidence
  Scenario: A malformed batch is repaired in the same generation operation
    Given an original source contract and an unvalidated manual-case draft
    When the case validator returns a concrete diagnostic
    Then the model receives the rejected draft, diagnostic and original scope
    And only the validated replacement is saved in the batch checkpoint
    And no human review, passing result or feature completion is recorded

  Scenario: Concrete actions use different phrasing
    Given manual cases with application, prerequisites, data, steps and observable outcomes
    When their first actions use navigation, keyboard, numbered or contextual phrasing
    Then a fixed opening-verb vocabulary does not reject the cases
    And incomplete fields and generic placeholders still require correction

  Scenario: Correction reaches an impasse or loses source authority
    Given a rejected manual authoring draft
    When the same diagnostic recurs three times or the source changes
    Then generation pauses with the reason and preserves validated batches
    And no invalid batch is published as a current manual pack
