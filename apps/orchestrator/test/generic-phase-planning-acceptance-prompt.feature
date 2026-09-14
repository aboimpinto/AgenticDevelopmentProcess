Feature: Generic phase planning and acceptance handoff
  Every phase consumes and maintains semantic planning and executable Product Owner acceptance traceability.

  Scenario: A planning phase creates the cross-phase handoff
    Given an arbitrary planning phase owns analysis
    When its worker receives the planning contract
    Then it creates a semantic implementation index for every declared phase
    And it records interfaces, dependencies, evidence, risks, and handoffs

  Scenario: A later phase consumes the handoff
    Given an arbitrary implementation phase follows planning
    When its worker starts declared work
    Then it reads its index row and every named source section
    And it does not redo planning from scratch

  Scenario: Acceptance coverage already exists
    Given an assigned Product Owner acceptance behavior has executable coverage
    When the worker prepares acceptance traceability
    Then it links the exact existing test
    And it does not create duplicate coverage

  Scenario: Planning preserves acceptance responsibility across levels
    Given an EPIC owns complete workflow acceptance
    When a phase or task plans isolated behavior verification
    Then the prompt keeps EPIC, FEAT, Phase and Task responsibilities distinct
    And coverage mappings remain many-to-many
    And passing isolated tests never replace assigned workflow E2E obligations
