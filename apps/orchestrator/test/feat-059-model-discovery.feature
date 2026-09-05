@EPIC-011 @catalog-discovery @backend
Feature: Safe model catalog discovery
  The server exposes only deterministic, normalized catalog facts and safe diagnostics.

  @E011-PROV-001
  Scenario: Safe connection-plus-model metadata is available through the catalog boundary
    Given active Pi and OpenAI-compatible connections with deterministic catalog fixtures
    When each connection is scanned through the public catalog routes
    Then the catalog returns stable connection ID plus model ID identities and safe capability metadata
    And no catalog response exposes an endpoint, credential, vault reference, or secret version

  @E011-PROV-002
  Scenario: An authenticated compatible scan makes its model safely selectable
    Given an active OpenAI-compatible connection with a test-only vault secret
    When its catalog scan succeeds through the public route
    Then the safe catalog response contains its normalized model
    And the response and diagnostic contain no secret material

  @E011-PROV-003
  Scenario: A failed scan removes only its stale connection snapshot
    Given two active connections have current catalog snapshots
    When one connection has an authentication-safe scan failure
    Then that connection has no selectable catalog model
    And the other connection retains its catalog model
    And the failed connection exposes only a safe scan diagnostic

  @E011-PROV-004
  Scenario: Pi Session discovery does not require catalog credential injection
    Given an active Pi Session connection with a deterministic Pi catalog fixture
    When the connection is scanned through the public route
    Then its normalized Pi model is returned with the Pi Session label
    And the scan does not use the compatible-provider credential transport
