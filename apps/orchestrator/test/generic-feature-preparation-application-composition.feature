Feature: Generic feature preparation application composition
  UI classification, design, refinement, and user-finding remediation share explicit preparation boundaries.

  Scenario: A feature is classified before refinement
    Given a submitted feature has a current source document
    When preparation evaluates whether UI work is required
    Then deterministic maintenance classification is preferred
    And ambiguous work uses the configured fast model

  Scenario: A refined feature is promoted safely
    Given design prerequisites and architecture-debt readiness are satisfied
    When the refinement worker creates its declared artifacts
    Then the phase execution contract is validated
    And transition evidence authorizes promotion

  Scenario: A user finding is remediated
    Given human review records an unresolved finding
    When the finding worker produces a response
    Then the response is appended to the durable findings phase
    And accepted findings can resume feature completion
