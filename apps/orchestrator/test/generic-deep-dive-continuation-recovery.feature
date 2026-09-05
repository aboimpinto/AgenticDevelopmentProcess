Feature: Generic Deep-Dive continuation recovery
  An in-progress work item can continue when source drift is only generated
  lifecycle metadata, while substantive uncertainty is returned to a human.

  Scenario: Current source needs no recovery
    Given the stored Deep-Dive hash matches the current source
    When continuation readiness is evaluated
    Then no readiness record or recovery session is created

  Scenario: Lifecycle-only drift is safely rebased
    Given requirements are unchanged and only generated lifecycle metadata differs
    When continuation readiness is evaluated
    Then the current semantic source is confirmed
    And existing UI classification remains tied to the new source hash

  Scenario: Substantive drift requires an explicit decision
    Given requirement-bearing source sections changed
    When continuation readiness is evaluated
    Then one recovery question identifies the changed scope
    And implementation continuation returns that recovery session

  Scenario: Missing semantic baseline requires an explicit decision
    Given no prior semantic source can be compared safely
    When continuation readiness is evaluated
    Then one baseline recovery question is started without inferred answers
