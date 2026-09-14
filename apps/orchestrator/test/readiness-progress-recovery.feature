Feature: Resume recoverable readiness work with failure context
  The same generic recovery policy applies regardless of project or phase identity.

  Scenario: Inspection worker error retains the original goal
    Given an inspection worker fails to read the configured inventory
    When HEPHA requests recovery with the original scope and exact failure
    Then the model can complete inspection without a new user Refresh
    And no tests run during inspection

  Scenario: Successive plan defects are repaired while validation progresses
    Given the plan contains several independent configuration defects
    When each model correction resolves another diagnosed defect
    Then HEPHA continues beyond two corrections and admits the valid plan
    And unaffected check and phase obligations remain present

  Scenario: A saved plan needs command admission correction
    Given a source-bound saved plan fails command admission
    When HEPHA provides the rejected candidate and exact admission diagnostic
    Then the model corrects the diagnosed command before execution
    And HEPHA validates and publishes the corrected plan

  Scenario: Execution worker error preserves completed native reports
    Given configured checks have executed and saved passing native reports
    And the worker fails while exporting its evidence
    When HEPHA requests recovery with the error and current artifacts
    Then the model completes the evidence handoff without rerunning passing tests
    And coverage assessment starts only after independent validation

  Scenario: A correction error informs the next attempt
    Given an evidence correction fails to resolve a report location
    When HEPHA requests the next correction
    Then the model receives that failure as well as the unresolved validation diagnostic
    And a substantiated correction can continue the current Refresh

  Scenario: Distinct coverage-format defects retain identical evidence
    Given a coverage response has several malformed required fields
    When corrections resolve the fields successively
    Then assessment can complete beyond one correction
    And every correction retains the original evidence and authority

  Scenario: Cosmetic response changes cannot prolong recovery indefinitely
    Given the same coverage field remains invalid
    When responses change only their length or audit metadata
    Then HEPHA detects repeated lack of validation progress and reports the exact defect

  Scenario: Cancellation and runtime authority remain effective
    Given recovery is pending
    When the workflow is cancelled or the runtime rejects its budget or authority
    Then no further recovery worker is dispatched to bypass that decision
