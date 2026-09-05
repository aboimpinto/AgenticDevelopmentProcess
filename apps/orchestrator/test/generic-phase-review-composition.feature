Feature: Generic phase review composition

  Scenario: A declared phase requires independent review
    Given implementation tasks have reached the declared review step
    When Hepha dispatches an independent reviewer
    Then review execution, repair, publication, and durable state use one shared graph

  Scenario: A declared phase does not require review
    Given the phase contract and observed files do not require review
    When Hepha plans the next phase action
    Then the review-aware planner follows the declared ordered task workflow

  Scenario: A review artifact needs contract repair
    Given a reviewer returned a recoverable malformed artifact
    When Hepha invokes review-contract repair
    Then the repaired artifact is independently published through the same lifecycle
