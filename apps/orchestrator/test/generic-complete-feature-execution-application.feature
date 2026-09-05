Feature: Generic Complete Feature execution boundary
  The orchestrator completes any ready feature through declared workflow nodes and durable state.

  Scenario: Completion transition is authorized
    Given a completed implementation and its current transition context
    When completion authorization is evaluated
    Then a valid transition receipt permits the completed state

  Scenario: Completion is not ready
    Given a feature whose completion prerequisites are not satisfied
    When completion startup is evaluated
    Then no workflow run is recorded or scheduled

  Scenario: Ready completion is scheduled
    Given a feature whose completion prerequisites are satisfied
    When completion startup is evaluated
    Then the running workflow is persisted before detached execution starts

  Scenario: Detached finalization starts successfully
    Given a current feature and its declared completion workflow
    When completion execution reaches finalization
    Then current context is collected and the detached completion worker is launched

  Scenario: Detached finalization fails
    Given the completion worker reports an execution error
    When completion execution handles the error
    Then a durable failure brief is persisted and observers are notified
