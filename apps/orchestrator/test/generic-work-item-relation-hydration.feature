Feature: Generic work-item relation hydration
  Scanned work items expose stable bidirectional relation summaries and unresolved references.

  Scenario: A feature declares a parent work group
    Given a feature document names a parent relationship
    When scanned work-item relations are hydrated
    Then the parent includes the feature as a reverse child relation

  Scenario: A referenced feature is absent
    Given a parent work item names a child that was not scanned
    When scanned work-item relations are hydrated
    Then the unresolved child identity is exposed without a fabricated relation

  Scenario: A parent declaration is absent
    Given a scanned feature already has linked parent identities
    When its parent identities are resolved
    Then the scanned links remain the fallback relationship source
