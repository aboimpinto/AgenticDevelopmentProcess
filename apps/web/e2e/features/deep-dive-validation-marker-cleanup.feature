Feature: Deep-Dive validation marker cleanup

  Scenario: Answered EPIC deep-dive does not stay blocked by its decision transcript
    Given EPIC-008 has two validation-marker references in its source document
    And the user answers the Deep-Dive questions for those references
    When Hepha applies the saved Deep-Dive answers using the deterministic fallback
    Then the EPIC source document contains no literal unresolved validation-marker token
    And the Hepha Deep-Dive Decisions section describes validation markers without reopening them
    And the EPIC card shows zero validation markers with a current Hepha Deep-Dive

  Scenario: Future deterministic Deep-Dive transcripts sanitize marker terminology
    Given a Deep-Dive question or answer mentions the validation-marker token by name
    When Hepha writes the fallback Hepha Deep-Dive Decisions section
    Then the transcript uses plain validation-marker wording instead of the literal blocker token
    And feature extraction is not blocked by the transcript itself
