Feature: Coordinated provider catalog scan triggers
  As a Hepha operator
  I want provider mutations and scan actions to share one scan authority
  So that active connection state is complete, isolated, and secret-safe

  Scenario: Material provider mutations scan only after durable persistence
    Given the provider and model-catalog HTTP routes use the production mutation application
    When an active connection is created or its endpoint or credential changes
    Then exactly one coordinated scan follows each persisted material mutation
    And label-only, rejected, validation, revoke, and preflight requests perform no catalog scan

  Scenario: Revoked credentials can reactivate one connection safely
    Given an active key-backed connection was revoked
    When a valid replacement credential is saved
    Then its opaque credential metadata and active lifecycle are replaced atomically
    And one connection-reactivated scan is coordinated without exposing the credential

  Scenario: Public scan state and forced retries remain isolated
    Given active connections can return available, empty, or failed catalog outcomes
    When an operator retries one connection or scans all active connections
    Then the V1 response contains canonical connection states in stable identity order
    And overlapping retries share one provider attempt
    And one failed provider does not suppress another connection result
    And no legacy results response or secret-bearing field is returned

  Scenario: Deleted reconciliation history cannot hide current connections
    Given two active connections have completed coordinated scans
    When one reconciled connection is hard-deleted through the provider route
    Then state reads and all-active scans omit the deleted identity
    And the remaining active connection stays visible and independently scannable
