@EPIC-011 @provider-connections @playwright
Feature: FEAT-058 Provider Connections And Secret-Safe Configuration

  As a Hepha operator
  I want to configure provider connections without exposing credentials
  So that Hepha can validate endpoints and manage secrets safely

  Background:
    Given the Models page is open
    And the Provider Connections section is visible

  @deterministic @E011-PROV-002
  Scenario: A known provider connection can be created with a masked secret
    When the operator clicks "Add Provider Connection"
    And selects "Known Provider" as the connection type
    And selects "OpenAI" as the known provider
    And enters "https://api.openai.com/v1" as the endpoint
    And enters a test API key in the secret field
    Then the secret field is masked as "password" type
    And the connection is saved without any visible secret value
    And the connection list shows the new connection with "has secret" indicator
    And no Models-page response, visible text, or browser console event contains the test secret

  @deterministic
  Scenario: A custom provider connection can be created
    When the operator clicks "Add Provider Connection"
    And selects "Custom Provider" as the connection type
    And enters "My Custom LLM" as the label
    And enters "https://api.my-llm.test/v1" as the endpoint
    And enters a test API key in the secret field
    Then the connection is saved and shown in the connection list
    And the detail view shows the custom provider label and endpoint

  @deterministic
  Scenario: A Pi Session connection requires no secret
    When the operator clicks "Add Provider Connection"
    And selects "Pi Session" as the connection type
    And enters a label and endpoint
    Then no secret field is shown
    And the connection is saved without a secret
    And the connection list shows the Pi Session connection with "no secret" indicator

  @deterministic
  Scenario: Connection diagnostics are displayed safely after validation
    Given an existing provider connection with a stored test secret
    When the operator clicks "Validate Connection"
    Then a diagnostic result is shown with safe message, severity, and timestamp
    And the diagnostic message does not contain the test secret or API key

  @deterministic
  Scenario: A secret can be rotated through the UI
    Given an existing provider connection with a stored secret
    When the operator clicks "Rotate Secret"
    And enters a new test secret value
    Then the secret version increments
    And no visible text or console event contains the old or new secret

  @deterministic
  Scenario: A secret can be revoked
    Given an existing provider connection with a stored secret
    When the operator clicks "Revoke Secret"
    Then the connection lifecycle state changes to "revoked"
    And the secret can no longer be used

  @deterministic
  Scenario: Connection deletion is blocked when dependencies exist
    Given an existing provider connection with active dependencies
    When the operator attempts to delete the connection
    Then a blocker message shows the dependent entity type and safe descriptor
    And the connection is not deleted

  @deterministic
  Scenario: Connection deletion succeeds when no dependencies exist
    Given an existing provider connection with no dependencies
    When the operator confirms deletion
    Then the connection is removed from the list
    And its lifecycle state changes to "deleted"

  @deterministic @E011-PROV-005
  Scenario: A provider validation fails securely on cross-host redirect
    Given an existing custom provider connection with a stored test secret
    And its endpoint responds with a redirect to a different host
    When the operator clicks "Validate Connection"
    Then the validation fails with a redirect-rejected diagnostic
    And the safe message mentions the blocked host but not the secret

  @deterministic
  Scenario: The connection list refreshes and shows current state
    Given the Provider Connections section has multiple connections
    When the operator clicks "Refresh"
    Then the connection list reloads and shows current lifecycle states
    And the list maintains stable scroll position where feasible

  @deterministic
  Scenario: An insecure remote endpoint is rejected during creation
    When the operator tries to create a connection with "http://api.insecure.com/v1"
    Then the creation fails with an "HTTPS required" message
    And no connection is created
