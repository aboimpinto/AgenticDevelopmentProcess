Feature: Generic workflow evidence projection
  Durable workflow summaries and phase checkpoint reports remain bounded and
  reproducible while structured state retains transition authority.

  Scenario: Verification evidence updates an existing phase document
    Given a phase document exists and full verification has a result
    When checkpoint evidence is projected
    Then the marker-bounded checkpoint report records its timestamp and review hash

  Scenario: Missing phase documents are not created by projection
    Given the target phase document is absent
    When checkpoint evidence is projected
    Then projection returns without creating a new phase document

  Scenario: Worker output becomes a bounded durable summary
    Given worker output contains fences, blank lines, and lengthy detail
    When workflow metadata is summarized
    Then at most six non-empty lines and six hundred characters are retained

  Scenario: Feature lessons use a stable project-relative identity
    Given a feature has an external identity
    When its lessons target is resolved
    Then the lower-case identity is placed under the project LessonsLearned folder
