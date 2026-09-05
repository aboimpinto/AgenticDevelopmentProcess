Feature: Generic marker-only Deep-Dive readiness
  Deep-Dive is required only while the authoritative work-item description contains an unresolved validation marker.

  Scenario: Marker-free source changes remain current
    Given a marker-free Feature Description has historical Deep-Dive metadata
    When its content or linked phase references change
    Then HEPHA does not require another Deep-Dive

  Scenario: Preparation artifacts remain context rather than freshness gates
    Given marker-free design documents are available to a Deep-Dive worker
    When one of those files is created or changed
    Then its content remains available as context
    But its hash does not require another Deep-Dive

  Scenario: Resolving all source markers clears the requirement
    Given the authoritative description contained an unresolved validation marker
    When the marker is replaced with the validated decision
    Then HEPHA considers the item current regardless of historical hashes
