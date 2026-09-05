Feature: Generic generated deep-dive question parsing
  Generated question rounds are normalized before they become user decisions.

  Scenario: Valid generated questions become pending decisions
    Given a generated question has a topic, prompt, and at least three valid options
    When the generic question parser reads the response
    Then the question and recommended option are normalized into a pending decision

  Scenario: Invalid generated questions are excluded
    Given generated questions omit required text or usable options
    When the generic question parser reads the response
    Then invalid questions are excluded and the round remains bounded

  Scenario: Malformed structured output reaches the fallback boundary
    Given the generated response contains malformed JSON
    When the generic question parser reads the response
    Then parsing fails so the caller can invoke deterministic fallback generation
