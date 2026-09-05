Feature: Generic feature action dispatch

  Scenario: Every action binds the current project and work item
    Given a current project and selected work item
    When a feature action is dispatched
    Then the command contains both identities and its action-specific input

  Scenario: Successful actions reconcile returned state
    Given the server accepts a feature action
    When the response contains project and work-item state
    Then the controller replaces those read models and clears the error

  Scenario: Selection follows the command policy
    Given an action may replace the selected work-item identity
    When returned items are reconciled
    Then selection is kept, matched, or cleared according to that action

  Scenario: Failed actions clear their pending marker
    Given a feature action transport fails
    When the failure is handled
    Then a safe error is reported and the pending marker is cleared
