Feature: Generic deep-dive session lifecycle
  Session answers and clarification chat are persisted independently from any feature topology.

  Scenario: The final answer advances a session to document update readiness
    Given a generic deep-dive session has one unanswered question
    When the production session application records a valid option
    Then the question is answered and the session becomes ready for update
    And the workflow readiness callback is invoked once

  Scenario: A saved answer produces an immediate dependent question
    Given a generic deep-dive session has a pending decision queue
    When the production session application saves an answer that requires clarification
    Then the adaptive follow-up is inserted immediately after its parent
    And document update remains blocked until the follow-up is answered

  Scenario: Clarification chat preserves both sides of the conversation
    Given a generic deep-dive question accepts clarification chat
    When the production session application receives a non-empty message
    Then user and assistant messages are appended with distinct identities
