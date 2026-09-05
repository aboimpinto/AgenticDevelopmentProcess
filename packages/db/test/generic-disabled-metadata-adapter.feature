Feature: Generic disabled metadata adapter
  The application can explicitly disable durable metadata without changing its workflow ports.

  Scenario: Writes are harmless when persistence is disabled
    Given metadata persistence is disabled
    When an application records workflow evidence
    Then the adapter accepts the operation without creating durable state

  Scenario: Reads reveal that durable state is unavailable
    Given metadata persistence is disabled
    When an application reads a singular or collection record
    Then the adapter returns an absent or empty result

  Scenario: Caller-owned records remain usable
    Given metadata persistence is disabled
    When an application submits a record that must be returned
    Then the adapter returns the same caller-owned record

  Scenario: The factory selects the disabled adapter explicitly
    Given the metadata-disable setting is active
    When the metadata-store factory composes an adapter
    Then it returns the disabled adapter without opening SQLite
