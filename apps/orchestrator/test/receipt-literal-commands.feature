Feature: Equivalent command presentation preserves native verification evidence
  Scenario: Quoted commands reach coverage without an agent repair
    Given a project-owned verification plan uses literal unquoted command arguments
    When the worker executes the same arguments with shell quoting and a bound console log
    And the configured tests produce passing native reports
    Then Refresh imports those reports without rewriting the recorded command
    And coverage assessment starts without repair or repeated test execution

  Scenario Outline: Literal quoting across project runners
    Given a configured <runner> command binds its arguments and report destination
    When quoting or escaped spaces preserve those literal arguments
    Then receipt command binding accepts the equivalent invocation
    Examples:
      | runner |
      | Node   |
      | Vitest |
      | dotnet |
      | Cargo  |

  Scenario: Shell behavior changes remain distinguishable
    Given a selected command and independently bound report evidence
    When the receipt changes selection, argument boundaries, expansion, or redirection semantics
    Then command binding reports the mismatch for the existing recovery loop
    And a matching command alone never certifies passing tests or sufficient coverage
