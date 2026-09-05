Feature: Descendant review artifact validation
  Every descendant artifact remains bound to immutable predecessor and authority evidence.

  Scenario: A remediation response answers the reviewer manifest
    Given a response references the validated manifest
    When remediation evidence is validated
    Then every required finding and remediation item is answered exactly once

  Scenario: A verification receipt binds manifest and response evidence
    Given a receipt references the validated manifest and remediation response
    When verification evidence is validated
    Then item and test outcomes cover the predecessor obligations

  Scenario: A replan remains bounded to an exhaustiveness decision
    Given a manifest finding explicitly requires replanning
    When the proposed replan is validated
    Then its defect class surfaces and tests remain bound to that finding

  Scenario: A debt observation uses active catalog authority
    Given a non-blocking debt finding has an exact active-rule snapshot
    When the debt observation is validated
    Then its historical surface and authority remain reviewer-owned

  Scenario: An ordered validation pipeline stops at the first refusal
    Given multiple pure validation checks are ordered
    When an earlier check returns a refusal
    Then later checks are not executed
