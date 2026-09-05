Feature: Generic deep-dive interaction

  Scenario: Question generation remains visible
    Given the deep-dive session is generating questions
    When the interaction overlay is rendered
    Then progress is presented without allowing completion

  Scenario: A saved answer is evaluated adaptively
    Given a decision was saved and follow-up evaluation is active
    When the interaction overlay is rendered
    Then the user sees that Hepha is checking for an immediate dependent question

  Scenario: A selected decision is recorded
    Given a pending question offers bounded options
    When the user selects an option and saves the decision
    Then the caller receives the selected option and optional detail

  Scenario: Topic clarification remains conversational
    Given a question is active
    When the user submits a focused clarification
    Then the caller receives the message for that question

  Scenario: Completed decisions enable document update
    Given every generated question is answered
    When the interaction overlay is rendered
    Then the document update action is available
