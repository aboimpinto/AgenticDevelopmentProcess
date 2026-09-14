Feature: Manual test review binding

  Scenario: Valid cases remain actionable while overall coverage is incomplete
    Given a current pack has a valid manual case and an uncovered criterion
    When the human reviews that specific case and records its observed result
    Then the result is bound to that case and pack version
    And bulk acceptance and feature completion remain blocked by uncovered criteria

  Scenario: Timed-out authoring resumes validated progress
    Given authoring has saved a validated batch and a subsequent batch times out
    When the human retries with unchanged sources and guidance
    Then only the remaining batches are authored
    And saved proposals are not execution evidence or approvals
    But changed sources require a fresh assessment

  Scenario Outline: Default regeneration adds missing cases without requiring steering
    Given the current pack has a human-executable coverage gap
    When regeneration is requested with <guidance> guidance
    Then the assessment drafts and validates the missing manual scenario
    And the replacement pack preserves existing mandatory cases
    And the human can review the replacement and record its executed tests
    And prior-pack results do not satisfy a subsequent replacement

    Examples:
      | guidance        |
      | omitted         |
      | empty           |
      | whitespace-only |
      | topic-specific  |

  Scenario: Missing authoring capability cannot silently reformat a pack
    Given a reviewed pack exists
    When regeneration is requested without an available assessment model
    Then generation fails with an actionable error
    And the previous pack and review remain intact

  Scenario: Namespaced case IDs are recorded from the reviewed manifest
    Given a validated pack uses stable nonnumeric manual case identifiers
    When the human reviews and records the executed cases as passing
    Then results use those exact identifiers

  Scenario: Guided regeneration adds traced cases without accepting delivery
    Given a pack has an uncovered criterion
    When the human requests a missing executable scenario
    Then validated model proposals preserve existing mandatory cases
    And the new version needs human review and execution
    And malformed output or changed source documents leave the current pack intact

  Scenario: Repeated generation with unchanged inputs reuses the current pack
    Given a current manual test pack was generated from unchanged traced inputs
    And that exact pack was reviewed
    When manual test pack generation is requested again
    Then the current pack identity is unchanged
    And the exact-pack review remains current

  Scenario: A superseded pack review cannot authorize the current pack
    Given a newer manual test pack superseded a previously reviewed pack
    When the current manual test status is projected
    Then the current pack is reported as unreviewed
    And passing results cannot be recorded with the superseded pack review

  Scenario: Changed traced inputs invalidate the prior exact-pack review
    Given a current manual test pack was reviewed
    When changed traced inputs produce a new pack
    Then the previous pack is superseded
    And the previous exact-pack review is invalidated
    And the new current pack requires its own review

  Scenario: Reviewing the current pack enables passing results
    Given a newer manual test pack superseded a previously reviewed pack
    When the exact current pack is reviewed
    Then the previous review is invalidated
    And passing results can be recorded against the current pack and review

  Scenario: All current manual cases can pass before automated coverage is resolved
    Given a current pack contains validated manual cases and uncovered acceptance criteria
    When the user reviews all current cases and explicitly records that they all passed
    Then each real manual case ID has a review-bound passing result
    And incomplete coverage still blocks feature completion
