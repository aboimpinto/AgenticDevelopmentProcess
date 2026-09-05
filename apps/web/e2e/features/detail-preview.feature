Feature: EPIC/FEAT Detail Selection and Document Preview

  As a user of the Hepha dashboard
  I want to select EPIC and FEAT work items and preview their documents
  So that I can inspect specifications, relationships, and manage workflow

  Background:
    Given the workspace is initialized with test projects
    And the API returns controlled board and document data

  @detail-selection
  Scenario: User opens EPIC detail blade
    Given the user is viewing the EPIC board
    When the user clicks an EPIC card
    Then the detail blade opens showing the EPIC title and external ID
    And the detail blade shows the EPIC source document path
    And the detail blade displays the EPIC specification content

  @detail-selection
  Scenario: User opens FEAT detail blade
    Given the user is viewing the FEAT board
    When the user clicks a FEAT card
    Then the detail blade opens showing the FEAT title and external ID
    And the detail blade shows the FEAT source document path
    And the detail blade displays the FEAT specification content

  @detail-document
  Scenario: Document refresh updates content
    Given the user is viewing a work item detail with the document loaded
    When the user clicks the reload button
    Then the document content is refreshed from disk
    And the updated content is displayed in the detail blade

  @detail-document
  Scenario: Document shows loading state during refresh
    Given the user is viewing a work item detail
    When the user clicks the reload button
    Then the loading indicator is shown while the document is read
    And the full document content is displayed after loading completes

  @detail-document
  Scenario: Document shows "missing" state
    Given the selected work item's document file does not exist on disk
    When the detail blade opens
    Then the "missing" status indicator is shown
    And a message is displayed: "The selected work item document was not found on disk."

  @detail-document
  Scenario: Document shows "unreadable" state
    Given the selected work item's document file cannot be read
    When the detail blade opens
    Then the "unreadable" status indicator is shown
    And the specific read error message is displayed

  @detail-navigation
  Scenario: User navigates to linked work item
    Given the user is viewing a work item detail blade
    And the work item has linked items
    When the user clicks a linked item row
    Then the detail blade navigates to the linked work item
    And the linked item's details are displayed

  @detail-close
  Scenario: User closes the detail blade
    Given the user is viewing a work item detail blade
    When the user clicks the close button
    Then the detail blade is closed
    And the board view is shown without the detail panel

  @detail-expand
  Scenario: User expands the detail blade
    Given the user is viewing a work item detail blade
    When the user clicks the expand button
    Then the detail blade expands to full overlay mode
    And the overlay backdrop is shown

  @detail-accessibility
  Scenario: Detail blade close via keyboard
    Given the user is viewing a work item detail blade
    When the user presses the Escape key
    Then the detail blade is closed
