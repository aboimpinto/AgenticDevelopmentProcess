Feature: Project-owned verification command handoff
  Scenario Outline: One declaration policy reaches refinement and development
    Given a <stack> project with its own runner configuration
    When refinement and phase development prompts are composed
    Then both receive the same TestPlan authoring policy
    And commands belong to FeatureDescription with Phase check references
    And static discovery cannot claim an executed pass
    And generated outputs do not silently waive runtime freshness checks
    Examples:
      | stack   |
      | service |
      | native  |
      | web     |
      | mixed   |
      | custom  |

  Scenario: Read-only coverage uses the inventory without authoring instructions
    When a read-only verification prompt is composed
    Then it references the TestPlan and reports gaps for authorized repair
    And it omits the full document-authoring policy
