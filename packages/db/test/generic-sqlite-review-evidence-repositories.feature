Feature: Generic SQLite review and final-verification evidence repositories
  Review remediation and final quality checks persist behind bounded repositories.

  Scenario: Review findings retain their source and resolution evidence
    Given a reviewer recorded an actionable finding
    When its decision and resolution are updated
    Then the finding, report, rationale, and current resolution are durable

  Scenario: Repair attempts remain auditable across review reruns
    Given unresolved findings require another repair
    When a later review evaluates the repair
    Then the before and after counts and rerun outcome are retained

  Scenario: Fingerprint recovery decisions survive workflow restarts
    Given unresolved finding fingerprints were evaluated at a review gate
    When the latest recovery decision is requested
    Then its continuation decision and comparison evidence are restored

  Scenario: Final verification retains runs and ordered checks
    Given a final quality run executes required checks
    When its evidence is loaded
    Then the aggregate result and individual check outcomes are available
