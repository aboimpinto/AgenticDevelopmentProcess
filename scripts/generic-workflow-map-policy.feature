Feature: Authoritative workflow control-flow map
  The workflow map must remain a diagnostic contract instead of becoming stale prose.

  Scenario: Declarative workflow documentation is the behavioral authority
    Given the workflow transition registry, command YAML, and result schemas
    When production behavior is implemented or changed
    Then application methods must conform to the documented transitions and contracts
    And changing an invariant requires documentation, justification, unit tests, and Gherkin evidence

  Scenario: Every mapped transition has executable ownership and evidence
    Given the workflow transition registry
    When the workflow map policy is evaluated
    Then every transition ID appears in a Mermaid diagram
    And every transition identifies an existing production method
    And every transition identifies existing unit-test evidence
    And every transition identifies existing Gherkin evidence

  Scenario: Declared command workflows cannot drift from their diagram index
    Given the YAML workflow definitions loaded by Hepha
    When the workflow map policy is evaluated
    Then every command and ordered node sequence matches the transition registry
    And every declared command and node appears in the workflow map

  Scenario: Workflow changes require causal justification
    Given a change to workflow routing or durable state
    When the workflow map policy is evaluated
    Then the change record explains why the issue happened
    And the change record explains what led to the issue
    And the change record explains why the proper test was absent
    And the change record identifies the missing invariant or earlier decision
    And the change record cites existing unit and Gherkin evidence
