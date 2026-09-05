Feature: Board Navigation and Refresh

  As a user of the Hepha dashboard
  I want to navigate between work board, EPIC board, and FEAT board views
  So that I can inspect and manage work items in different state folders

  Background:
    Given the workspace is initialized with test projects
    And the API returns controlled board data

  @board-navigation
  Scenario: User switches between board views
    Given the dashboard shows the work board
    When the user clicks the "EPIC Board" view selector
    Then the EPIC board is displayed with EPIC cards grouped by state folder
    When the user clicks the "FEAT Board" view selector
    Then the FEAT board is displayed with FEAT cards grouped by state folder
    When the user clicks the "Work Board" view selector
    Then the work board is displayed with all work items grouped by state folder

  @board-navigation
  Scenario: Board column displays correct title and counts
    Given the user is viewing the work board
    Then each board column displays the correct state folder title
    And each board column shows the total item count
    And completed columns show "Show completed items" link when overflow exists

  @board-navigation
  Scenario: Board card selection highlights the card
    Given the user is viewing the work board
    When the user clicks a work item card
    Then the selected card receives the selected visual style
    And the detail blade opens for the selected item

  @board-refresh
  Scenario: User triggers board refresh
    Given the dashboard is showing board data
    When the user clicks the refresh button
    Then the board reloads work items from the workspace
    And the board displays the updated card data
    And the "Refreshed from disk" confirmation is visible

  @board-refresh
  Scenario: Board preserves card selection after refresh
    Given a card is selected on the board
    When the user triggers a board refresh
    And the selected item still exists in the refreshed data
    Then the card remains selected
    And the detail blade continues to show the selected item

  @board-refresh
  Scenario: Board handles refresh with stale selection
    Given a card is selected on the board
    When the user triggers a board refresh
    And the selected item no longer exists in the refreshed data
    Then the selected card is deselected
    And the detail blade is cleared
    And no stale content is displayed

  @board-error
  Scenario: Board displays error state on failed load
    Given the workspace API returns an error
    When the board attempts to load
    Then an error message is displayed
    And the user can retry loading
