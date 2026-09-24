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
