Feature: Generic phase code-review scope
  An independent reviewer judges only phase-owned production behavior and cannot expand a stable finding beyond its original contract.

  Scenario: A concern belongs to a later phase
    Given an arbitrary phase has an explicit production boundary
    When the reviewer notices a concern owned by a later phase
    Then the concern is not added to this review manifest
    And no fixer is dispatched for it

  Scenario: Context material explains a production contract
    Given an arbitrary context-only document helps explain changed production code
    When the reviewer reads that document
    Then findings remain limited to production review targets
    And the context document cannot become a finding target

  Scenario: A stable finding remains open repeatedly
    Given the same arbitrary finding has two unsuccessful fix proposals
    When the reviewer prepares the next remediation contract
    Then one complete bounded acceptance matrix is published
    And the fixer is not asked to infer omitted requirements
