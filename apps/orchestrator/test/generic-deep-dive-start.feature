Feature: Generic Deep-Dive startup
  A durable question session is started for any eligible work item before refinement or decomposition continues.

  Scenario: An open session already exists
    Given an eligible work item already has an open Deep-Dive session
    When Deep-Dive startup is requested
    Then the existing session is returned without creating another workflow

  Scenario: A normal question round starts
    Given an eligible work item has a readable current source document
    When Deep-Dive startup is requested
    Then a durable generating session and workflow run are recorded
    And ordered question generation is scheduled

  Scenario: Stale source recovery starts
    Given continuation requires an explicit stale-source decision
    When Deep-Dive recovery is started
    Then the recovery question is stored directly in the question round
    And model question generation is not scheduled

  Scenario: Question generation succeeds
    Given a durable generating session exists
    When the ordered workflow produces questions
    Then the session becomes a finished question round
    And observers are notified that questions are ready

  Scenario: Question generation fails
    Given a durable generating session exists
    When question planning or persistence fails
    Then the failure is contained and recorded when storage remains available
    And observers are notified that the Deep-Dive failed
