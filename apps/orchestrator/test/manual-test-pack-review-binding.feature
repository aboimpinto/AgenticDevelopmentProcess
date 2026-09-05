Feature: Manual test review binding

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
