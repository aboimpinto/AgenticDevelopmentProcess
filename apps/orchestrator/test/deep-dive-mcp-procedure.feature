Feature: One procedural authority for a hosted Deep-Dive
  Scenario: MCP owns every hosted interview stage
    Given the MCP recipe source is selected
    When the host requests an opening follow-up clarification or apply-answers stage
    Then the model receives only that returned procedure and the saved context once
    And the existing UI result format and registered model route remain unchanged
    And the model has no file or shell tools

  Scenario: Missing or incompatible recipes cannot become a native success
    Given the selected MCP stage is missing incompatible or targets another document
    When the host prepares a model call
    Then the call fails before model execution or source mutation
    And no native procedure or deterministic document rewrite is substituted

  Scenario: Empty model output cannot erase the target
    Given the hosted apply-answers model returns no document
    When HEPHA evaluates the rewrite
    Then it fails before writing the target source

  Scenario: Current source and prior decisions survive a hosted interview turn
    Given the target changed since the interview began and design documents constrain its answers
    When follow-up or clarification runs
    Then the current primary preparation context and saved transcript constrain the turn
    And apply-answers publishes exact edits which preserve untouched target text
    But a source edit during model execution prevents the write

  Scenario: Oversized MCP responses stop before complete buffering
    Given the recipe server streams more than the response byte limit
    When HEPHA reads the response
    Then the stream is cancelled and no model call is made
