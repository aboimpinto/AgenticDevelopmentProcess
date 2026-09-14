Feature: Recover verification evidence before acceptance coverage assessment
  A receipt defect is work for the verification agent within the same Refresh.
  Only independently validated execution evidence can reach coverage assessment.

  Scenario Outline: Repair recording defects without rerunning passing suites
    Given configured tests have really executed and passed in the current Refresh
    And their receipt has a <defect> defect
    When HEPHA returns the validation diagnostic and current plan to the verification agent
    And the agent corrects the receipt from the actual invocation and native reports
    Then HEPHA validates the corrected receipt and assesses acceptance coverage
    And the passing suites are not run again
    And the rejected receipt and correction response remain auditable
    Examples:
      | defect   |
      | command  |
      | checksum |
      | json     |

  Scenario: Recover an unavailable native report through focused execution
    Given one current check has lost its native report
    And the other selected check has valid passing evidence
    When the agent reruns only the affected configured check and saves its native report
    Then HEPHA reaches coverage assessment preserving the unaffected evidence

  Scenario: A failing native report cannot be repaired by claiming a pass
    Given a configured test has actually failed
    When an agent repeatedly edits receipt success flags and timestamps
    Then independent native validation continues to reject the result
    And HEPHA requests diagnosis before escalating repeated lack of validation progress
    And coverage assessment does not start

  Scenario: Source changed during evidence recovery
    Given HEPHA has requested an evidence correction
    When source changes during that correction
    Then the original verification baseline cannot certify the new source
    And coverage assessment does not start

  Scenario: Cancellation during evidence recovery
    Given a verification agent is repairing evidence
    When the user cancels the workflow before the agent returns
    Then the late response cannot overwrite cancellation or start coverage assessment
