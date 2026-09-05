Feature: Manual Test Verification Pack

  Scenario: No pack generated — shows generate button
    Given the dashboard is loaded with a validated project
    And the selected FEAT has all implementation phases resolved
    And no manual test verification pack exists
    When I view the FEAT detail panel
    Then I see a "Generate Test Pack" button
    And the "Complete Feature" action is not yet available

  Scenario: Pack generated and unreviewed — shows review prompt
    Given the dashboard is loaded with a validated project
    And the selected FEAT has all implementation phases resolved
    And a current manual test verification pack exists
    And the current pack has not been reviewed
    When I view the FEAT detail panel
    Then I see the pack version indicator
    And I see a "Review Pack" button
    And I cannot record manual test results as passing

  Scenario: Review acknowledgement enables test recording
    Given the dashboard is loaded with a validated project
    And a current manual test verification pack exists
    And the pack has been reviewed
    When I view the FEAT detail panel
    Then I see the pack is marked as reviewed
    And I can record passing manual tests
    And I can record failing manual tests

  Scenario: Stale pack shows warning and regenerate option
    Given the dashboard is loaded with a validated project
    And the selected FEAT has a stale manual test verification pack
    When I view the FEAT detail panel
    Then I see a stale indicator badge
    And I see a "Regenerate" button
    And I cannot record manual test results

  Scenario: Record a passing test
    Given the dashboard is loaded with a validated project
    And a current reviewed manual test verification pack exists
    When I click "Record Pass"
    Then the pack status shows a passing test count
    And a success notice is displayed

  Scenario: Record a failing test creates a finding
    Given the dashboard is loaded with a validated project
    And a current reviewed manual test verification pack exists
    When I click "Record Failure"
    Then an inline failure form appears
    When I enter a Test ID and Actual Result and click Submit Failure
    Then a Human Review Finding is created
    And the pack shows the failed test count
