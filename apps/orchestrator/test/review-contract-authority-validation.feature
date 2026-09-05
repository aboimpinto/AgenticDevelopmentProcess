Feature: Review finding authority validation
  Findings are authoritative only when their declared evidence matches an active source.

  Scenario: An active rule snapshot matches the catalog
    Given a finding references an active rule
    And its immutable snapshot matches every canonical catalog field
    When finding authority is resolved
    Then the catalog snapshot becomes the validated authority

  Scenario: An inactive or unknown rule cannot authorize a finding
    Given a finding references a rule without active catalog authority
    When finding authority is resolved
    Then a sanitized lifecycle-specific refusal is returned

  Scenario: Feature correctness uses a scoped acceptance criterion
    Given a correctness finding references an acceptance criterion
    And the criterion belongs to the reviewed work item
    When finding authority is resolved
    Then the criterion source becomes the validated authority

  Scenario: A mismatched snapshot cannot borrow catalog authority
    Given a finding changes one field from the active catalog snapshot
    When finding authority is resolved
    Then the finding is rejected before artifact validation continues
