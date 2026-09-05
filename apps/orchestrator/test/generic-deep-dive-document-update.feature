Feature: Generic Deep-Dive document update
  Answered decisions update a work-item document without making model availability a workflow failure boundary.

  Scenario: The model returns a complete document
    Given all Deep-Dive questions have saved answers
    When the document update agent returns Markdown
    Then fences and resolved validation-marker prose are normalized before persistence

  Scenario: The document is too large for model rewriting
    Given the source document exceeds the configured rewrite boundary
    When document update begins
    Then a deterministic decision section is applied without invoking the model

  Scenario: The document update agent is unavailable
    Given the source document is eligible for model rewriting
    When the document update agent fails
    Then the saved answers are applied deterministically and the workflow can continue
