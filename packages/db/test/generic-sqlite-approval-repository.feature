Feature: Generic SQLite approval repository
  Human authorization requests persist behind one bounded repository.

  Scenario: A pending approval remains available after a restart
    Given a protected action requires human authorization
    When the approval request is persisted and loaded
    Then its action, policy reason, risk, deadline, and pending state are restored

  Scenario: Approval queues support current and historical views
    Given several authorization requests exist
    When an operator filters and limits the queue
    Then matching requests are returned from newest to oldest

  Scenario: A final authorization decision is idempotent
    Given an approval request is pending
    When an operator resolves it more than once
    Then the first final decision and its rationale remain authoritative

  Scenario: Expired pending approvals are finalized in one sweep
    Given pending requests have different timeout deadlines
    When timeout finalization runs at the current clock value
    Then only elapsed requests become timed out
