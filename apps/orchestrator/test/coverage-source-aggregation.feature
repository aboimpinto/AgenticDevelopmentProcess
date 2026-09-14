Feature: Bounded generic readiness aggregation
  Readiness retrieves source context without rewriting requirements or executing client tests.
  Several existing tests may collectively establish a criterion, but never waive a required boundary.

  @CA01
  Scenario: Large sources and complementary evidence are assessed once within budget
    Given oversized source documents with qualifications on different pages
    And separate executed validation and persistence reports
    And a browser requirement with no browser execution evidence
    When readiness compacts evidence and inspects every source page
    Then one collective assessment receives both reports and bounded exact additional qualifications
    And complementary coverage is proposed without approving it
    And the browser requirement remains unresolved
    And saved human results are unchanged

  @CA02
  Scenario Outline: Invalid retrieval cannot produce a coverage verdict
    Given oversized source context
    When source retrieval returns <invalid response>
    Then assessment stops before a final verdict
    And no missing-test repair or passing result is inferred
    Examples:
      | invalid response    |
      | unknown-passage     |
      | omitted-criterion   |
      | partial-inspection  |

  @CA03
  Scenario: Retry reuses validated source pages but not stale source authority
    Given all source pages were validated and the final provider failed
    When readiness retries with unchanged evidence and documents
    Then validated source pages are reused
    And only the final provider stage is retried
    When a source qualification changes
    Then the changed source is inspected before a new verdict

  @CA04
  Scenario: Shared source passages preserve exact provenance and negative context
    Given multiple criteria reference a shared source qualification
    When readiness builds criterion-scoped context
    Then the exact passage is included once with both criterion memberships
    And its source digest, offset and enclosing headings are retained
    And missing execution remains a limitation

  @CA05
  Scenario: Every source passage discusses related workflows
    Given densely cross-referenced documents with repeated operative clauses
    And a distinct negative qualification appears at the end
    When readiness extracts concise exact clauses instead of whole related passages
    Then the final context preserves the late negative qualification and complementary evidence
    And repeated discussions do not trigger raw identity retrieval
    And the collective assessment fits its budget

  @CA06
  Scenario: Identity retrieval cannot solve oversized non-identity context
    Given source or report metadata alone exceeds the final assessment budget
    When readiness checks the minimum payload before identity retrieval
    Then no futile identity retrieval is dispatched
    And no missing test, approval or passing result is inferred

  @CA07
  Scenario: Overlapping criteria share a final assessment without sharing unearned proof
    Given the whole selected evidence union exceeds one final request
    And two criteria's complete selected evidence fits together
    When readiness packs bounded final assessments
    Then those criteria share one request with their complete report-bound identity union
    And remaining criteria are assessed separately without truncation

  @CA08
  Scenario: Model capacity drives progressive compaction and visible recovery
    Given the selected model has known context and output limits
    And tokenized instructions, evidence and reserved framing consume at least 50 percent of the available input tokens
    When readiness performs light lossless compaction and remeasures
    And the remaining request reaches 80 percent
    Then strong compaction inspects bounded source pages and preserves exact qualifications
    And oversized fact responses are subdivided into smaller disjoint pages with bounded retries
    And the user sees compaction running then completed before final assessment
    And compaction cannot approve coverage or unlock completion on its own

  @CA09
  Scenario: The post-compaction target is not an early rejection threshold
    Given a tokenized request remains between 75 and 80 percent of available input capacity
    When light compaction cannot reduce it further
    Then readiness assesses it without requiring strong extraction
    And the 75 percent target is applied only after the strong-compaction trigger
