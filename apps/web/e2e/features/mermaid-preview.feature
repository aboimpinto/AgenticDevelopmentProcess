Feature: Mermaid document compatibility
  Existing specification diagrams remain readable after a renderer upgrade.

  Scenario Outline: Render a real diagram from the document API
    Given a work item document contains a Mermaid <kind> diagram
    When the user opens its document preview
    Then the real renderer displays an SVG with the expected labels
    And no diagram error is shown

    Examples:
      | kind      |
      | flowchart |
      | sequence  |
      | state     |
      | class     |

  Scenario: Recover from malformed diagram source
    Given a document contains an invalid Mermaid diagram
    When the user opens the document preview
    Then an error and the original source are visible
    When the source is repaired and the document is reloaded
    Then the real diagram is rendered and the error disappears
