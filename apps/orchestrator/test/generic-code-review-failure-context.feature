Feature: Generic code-review failure context discovery
  Recovery must use the newest actionable persisted review instead of trusting stale failure prose.

  Scenario: The newest actionable phase report is selected
    Given several timestamped review reports exist for a numbered phase
    When review recovery discovers its current context
    Then the newest report with a verdict and findings is authoritative

  Scenario: Infrastructure notes do not hide an actionable report
    Given a newer audit file has no review verdict or finding contract
    When review recovery discovers its current context
    Then the earlier actionable review remains selected

  Scenario: A later approval supersedes a persisted failure
    Given a failure brief references an older rejected review
    When a later report independently approves the same numbered phase
    Then the historical blocker is no longer supplied to a retry
