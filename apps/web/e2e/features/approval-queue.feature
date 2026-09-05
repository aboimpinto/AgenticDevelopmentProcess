Feature: Approval Queue

  Scenario: Loading and empty approval queue
    Given the dashboard is loaded with a valid project
    When I open the Approvals view
    Then I see a loading indicator
    When no approvals are pending
    Then I see "No pending approvals. All commands are within policy."

  Scenario: Pending approvals are displayed
    Given the dashboard is loaded with a valid project
    When I open the Approvals view
    And the API returns pending approvals
    Then I see approval cards with action summary, policy reason, and timeout info
    And each card has an Approve and a Deny button

  Scenario: Approve a pending approval
    Given the dashboard is loaded with a valid project
    And pending approvals are visible
    When I click Approve on a pending approval
    Then the approval card is removed from the queue
    And no error message is shown

  Scenario: Deny a pending approval
    Given the dashboard is loaded with a valid project
    And pending approvals are visible
    When I click Deny on a pending approval
    Then the approval card is removed from the queue
    And no error message is shown

  Scenario: Approval queue fetch error
    Given the dashboard is loaded with a valid project
    When I open the Approvals view
    And the approvals API returns an error
    Then I see an error banner with the failure message
    And the refresh button is still available

  Scenario: Approve resolves a pending approval from the static list
    Given the dashboard is loaded with a valid project
    And pending approvals are visible
    When I click Approve on the first approval
    Then the approval card is removed from the queue

  Scenario: Timeout deadline is displayed on pending approvals
    Given the dashboard is loaded with a valid project
    When I open the Approvals view
    And the API returns an approval with a timeout deadline
    Then the timeout status is visible on the approval card
