Feature: Manual Test Verification Pack

  Scenario: Passing results are distinct from unresolved acceptance coverage
    Given every current manual case has a reviewed passing result
    And acceptance coverage is still unresolved
    Then the manual-test launcher reports all current manual cases passed in green independently of acceptance coverage
    And each recorded pass is green and cannot be submitted again
    And the panel explains that coverage checks are not recorded test failures
    And whole-pack acceptance remains unavailable

  Scenario: Long packs keep actions outside collapsible content
    Given a manual pack has many coverage issues and a long executable test
    Then coverage explanations and test instructions start collapsed
    And review and result buttons remain outside the collapsed content
    When I expand test instructions with the keyboard and scroll through them
    Then the case actions and fixed pack actions remain visible
    And the close button remains visible on desktop and narrow screens
    And expanding content does not record reviews or results

  Scenario: Record one reviewed case without accepting incomplete coverage
    Given the current pack contains an executable case and uncovered acceptance criteria
    When I review the individual case and explicitly record it as passed
    Then the request names the exact pack review and case
    And the uncovered criteria remain visible
    And All tests passed remains unavailable

  Scenario: Current incomplete pack can be regenerated without passing or approving tests
    Given a current reviewed pack still has uncovered acceptance criteria
    When I regenerate with an empty guidance field
    Then a fresh pack is requested using the exact current pack identity
    And no test result or approval is recorded
    And the replacement containing the newly drafted scenarios offers pack review
    When I review the replacement pack
    Then manual result recording is enabled for that version

  Scenario: Regeneration forwards optional human steering without granting approval
    Given a current pack is missing keyboard and error recovery scenarios
    When I enter those topics in "What is missing? (optional)"
    And I regenerate the test pack
    Then my guidance is sent with the exact current pack identity
    And the proposed cases require review before execution results can be recorded

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

  Scenario: Actions remain visible above long case lists
    Given an outdated manual pack and paused regeneration
    When the user opens verification and scrolls through the cases
    Then review, all-pass and regeneration actions remain visible at the top
    And disabled all-pass recording explains the stale pack
    And regeneration is explicitly described as unfinished

  Scenario: Human checks precede completion readiness in the feature detail
    Given implementation is complete and manual verification is available
    When the user opens the feature
    Then user code review appears before manual tests
    And manual tests appear before completion readiness
    And recorded manual passes point to readiness refresh as the next coverage action
