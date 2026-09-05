Feature: Missing FEAT preview recovery

  Scenario: Stale apply closes the old preview and lets the user request a new one
    Given HEPHA scanned EPIC-004 with a current deep-dive
    And the EPIC missing-FEAT preview is open
    When I apply the preview after the EPIC state changed
    Then the stale preview error is shown
    And the old Create FEATs action is removed
    And I can request a new missing-FEAT preview

  Scenario: Unchanged preview creates the planned FEATs
    Given HEPHA scanned EPIC-004 with a current deep-dive
    And the EPIC missing-FEAT preview is open
    When I apply the preview without changing the EPIC
    Then the planned FEAT is created
    And the preview panel closes
    And no stale preview error is shown
