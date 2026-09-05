Feature: Generic workflow summary projection
  Dashboard workflow state is derived from durable work-item evidence.

  Scenario: An aggregate without workflow metadata has no workflow summary
    Given a non-feature work item without a persisted workflow run
    When its workflow summary is projected
    Then no workflow summary is returned

  Scenario: Durable implementation work can continue
    Given an in-progress feature has refinement artifacts and unresolved implementation work
    When continuation readiness passes
    Then the workflow summary allows continuation

  Scenario Outline: A stopped implementation remains manually continuable
    Given an in-progress implementation has a <status> workflow run
    And its execution contract is valid with unresolved work
    But a refinement-only satellite is invalid
    When its workflow summary is projected
    Then the workflow summary allows continuation

    Examples:
      | status    |
      | failed    |
      | blocked   |
      | cancelled |

  Scenario: Completion-only obligations do not block current implementation
    Given an in-progress feature can continue implementation
    But future completion evidence is not yet available
    When its workflow summary is projected
    Then current workflow readiness is ready to continue
    And completion remains a separate later gate

  Scenario: A provider-completed feature remains manually verifiable
    Given a feature has been moved to the completed lifecycle folder
    And every implementation phase is resolved
    When its workflow summary is projected
    Then manual test-pack generation remains available
    And implementation continuation remains unavailable

  Scenario: A running implementation cannot be started twice
    Given an in-progress implementation still has an active workflow
    When its workflow summary is projected
    Then the workflow summary does not allow continuation

  Scenario: An invalid execution contract blocks manual continuation
    Given an in-progress implementation has unresolved work
    But its execution contract is invalid
    When its workflow summary is projected
    Then the workflow summary does not allow continuation

  Scenario: Stale UI classification is not reused
    Given the stored UI decision belongs to an older document hash
    When the workflow summary is projected
    Then the UI decision is unknown

  Scenario: Durable artifacts supersede a stale failed workflow
    Given persisted artifacts prove that a failed workflow completed its responsibility
    When the workflow summary is projected
    Then the run is presented as recovered and completed
