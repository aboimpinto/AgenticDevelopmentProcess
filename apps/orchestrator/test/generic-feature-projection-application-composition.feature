Feature: Generic feature projection application composition
  Artifact readiness and workflow presentation share one application boundary.

  Scenario: Preparation artifacts are inspected
    Given design, refinement, and timing work has produced durable documents
    When transition readiness is evaluated
    Then each artifact policy validates only the evidence it owns
    And no presentation decision changes the documents

  Scenario: Workflow progress is presented
    Given a configured workflow contains ordered nodes
    When current execution progress is projected
    Then node status and detail are derived without starting a worker
    And an unavailable workflow definition yields no progress projection

  Scenario: Feature workflow state is summarized
    Given workflow metadata, phase runs, and findings are available
    When the feature summary is projected
    Then readiness, recovery, and implementation evidence use their specialized policies
    And the summary does not create workflow state
