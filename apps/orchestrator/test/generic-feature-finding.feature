Feature: Generic human-review finding lifecycle
  Findings are durable threads whose agents may propose fixes but cannot close user acceptance.

  Scenario: A new finding starts one scoped response
    Given declared implementation work is resolved and review storage is available
    When the production finding application records a detailed finding
    Then durable finding evidence and the review document are updated before one agent response starts

  Scenario: Acceptance closes settled findings but rejects running responses
    Given the review findings document is awaiting user acceptance
    When the production finding application accepts the document
    Then every settled open finding is closed and the document is completed
    But an active finding response prevents acceptance
