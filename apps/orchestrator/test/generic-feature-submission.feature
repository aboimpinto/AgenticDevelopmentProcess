Feature: Generic feature submission
  One validated feature document is created under a newly allocated identity without overwriting existing work.

  Scenario: Required input is incomplete
    Given a title or summary is blank
    When feature submission is requested
    Then submission is rejected before identity allocation

  Scenario: A named parent does not exist
    Given submission names a parent work item
    When the current project scan cannot find that parent
    Then submission is rejected before writing a document

  Scenario: Valid feature scope is submitted
    Given required input and any named parent are valid
    When feature submission is requested
    Then a collision-aware identity and submitted document are created
    And the created feature is reloaded and observers are notified

  Scenario: The allocated path already exists
    Given the allocated feature folder or document already exists
    When feature submission is requested
    Then overwrite is denied and the operator is asked to refresh
