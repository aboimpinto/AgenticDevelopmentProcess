Feature: Generic workflow model routing
  Registered actions receive validated catalog identities from one persisted routing policy.

  Scenario: A configured workflow transition selects its authenticated model
    Given a registered action resolves through its persisted Action, Action Type, or Global selector
    When the routing policy service resolves that action
    Then it returns the exact available connection and model identity in a typed plan

  Scenario: A model alias is normalized within its provider family
    Given an input names a model by label, family alias, or any value other than a registered action ID
    When the routing policy service validates the input
    Then it rejects the input without inferring a catalog route, because no label alias, workflow model field, or environment default selects a route

  Scenario: Missing authentication produces an actionable error
    Given the selected connection/model identity is unavailable in the active catalog
    When the routing policy service resolves the registered action
    Then it returns a sanitized unavailable-route rejection without a dispatch plan
