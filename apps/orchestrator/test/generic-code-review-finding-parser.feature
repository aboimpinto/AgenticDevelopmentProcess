Feature: Generic code review finding parsing
  Review reports can express findings in different Markdown shapes while preserving the same workflow decisions.

  Scenario: Structured findings preserve reviewer identities
    Given a review report contains structured finding sections
    When the generic finding parser reads the report
    Then each reviewer identity and required field is preserved

  Scenario: Table and note findings share one decision list
    Given findings and non-blocking notes use Markdown tables
    When the generic finding parser reads the report
    Then severity aliases are normalized and every item has a decision requirement

  Scenario: Informal bullet findings remain bounded
    Given a review report contains only bullet findings
    When the generic finding parser reads the report
    Then inline formatting is removed and at most twelve findings are returned
