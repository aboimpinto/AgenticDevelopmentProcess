Feature: Generic work-item ID allocation
  New work items receive durable identifiers that do not collide with existing MemoryBank folders.

  Scenario: No prior identifier state exists
    Given the relevant work-item folders and counter contain no prior identifier
    When an identifier is allocated
    Then numbering starts at one and the next number is persisted

  Scenario: Folder discovery is ahead of the counter
    Given an existing work-item folder contains a larger identifier than the counter
    When an identifier is allocated
    Then allocation continues after the observed folder identifier

  Scenario: Explicitly created feature identifiers advance the counter
    Given a batch created one or more valid feature identifiers
    When the feature counter is advanced
    Then it remains greater than every created identifier and never moves backwards
