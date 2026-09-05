Feature: Generic persistence contracts
  Persistence adapters must implement stable records and narrow operations without owning application policy.

  Scenario: Reconcile scanned card metadata
    Given a scanner produced card metadata
    When a metadata store reconciles the scan
    Then stored card state is returned through the card contract

  Scenario: Persist workflow and finding evidence
    Given workflow progress and finding events were produced
    When the metadata store records them
    Then their durable records retain workflow and card correlation

  Scenario: Query invocation telemetry
    Given normalized agent events were stored
    When telemetry is queried with bounded filters
    Then stored invocation and event records are returned

  Scenario: Persist delivery and verification evidence
    Given delivery, automated verification, and manual test outcomes exist
    When their repositories record the evidence
    Then each result retains its own persistence contract
