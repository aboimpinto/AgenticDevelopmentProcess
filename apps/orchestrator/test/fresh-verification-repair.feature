Feature: Failed refresh checks remain repairable within the feature
  Scenario: A historical green phase owns a currently failing configured check
    Given the last refresh has a bound failed command and unchanged report checksum
    And the execution plan maps the check to a resolved phase
    When the dashboard projects completion readiness
    Then the phase offers Fix failing tests / checks despite historical green evidence
    And the repair prompt traces tasks and compares prior reports and source history

  Scenario: Repair returns without independent acceptance
    Given the user requested repair of failed refresh checks
    When the repair worker returns after its scoped repair loop
    Then HEPHA starts fresh verification independently
    And neither worker prose nor a prior green checkpoint completes the feature

  Scenario: Failure evidence was changed
    Given a receipt command or report checksum no longer matches the recorded refresh
    When repair is requested
    Then HEPHA rejects that repair context before worker dispatch
