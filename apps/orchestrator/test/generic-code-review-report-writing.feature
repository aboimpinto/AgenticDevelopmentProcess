Feature: Generic code-review report writing
  A validated review publication receives one durable human-readable report without owning review authority.

  Scenario: The review directory does not exist yet
    Given a validated report is ready for a phase
    When the report is written
    Then its review directory and timestamped phase path are created

  Scenario: The report is wrapped in an outer Markdown fence
    Given transport formatting wrapped the complete report
    When the report is written
    Then only the outer fence is removed
    And the persisted report ends with one newline

  Scenario: Review authority has already been decided
    Given the authoritative review pipeline supplied the report content
    When the report writer persists it
    Then the writer does not parse or change the review decision
