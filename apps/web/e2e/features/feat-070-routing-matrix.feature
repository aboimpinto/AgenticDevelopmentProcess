@EPIC-011 @FEAT-070 @playwright @deterministic
Feature: Complete registry-projected Routing Defaults editor
  As a Hepha operator
  I want every registered route to be visible and safely editable
  So that future worker routing remains complete, explainable, and auditable

  Background:
    Given deterministic closed V1 routing-matrix HTTP fixtures
    And the Models Routing Defaults tab is open

  @E011-ROUTE-002 @E011-ROUTE-006
  Scenario: A Global-only policy renders the complete authoritative hierarchy
    Given the sparse policy contains only Global Default
    When the operator inspects Routing Defaults
    Then Global, five action-type defaults, and seventeen action rows are visible
    And every non-global row is Inherit with server-supplied effective Global facts
    And reading the matrix creates no policy mutation

  @E011-ROUTE-003 @E011-ROUTE-007 @E011-ROUTE-010
  Scenario: Independent Implementation drafts settle with friendly and immutable identity
    Given Implementation and all five Implementation actions inherit Global
    When the operator drafts Implementation and Continue Implementing independently
    And saves each row against its current revision guard
    Then Start Feature resolves from the saved Action type route
    And Continue Implementing resolves from its saved Action route
    And friendly labels are visible while each mutation retains immutable connection and model IDs

  @E011-ROUTE-004 @E011-ROUTE-008 @E011-SAFE-001 @E011-SAFE-002
  Scenario: Failure-policy editing exposes every safe mode and refuses unsafe choices
    Given Code Review has eligible, unavailable, and capability-ineligible route choices
    When the operator creates an explicit Code Review route and edits its failure policy
    Then Fail immediately, Global reroute, and selected-route reroute are available
    And the primary route is disabled as its own fallback
    And every unmet capability is explained without an unsafe save or browser fallback

  @E011-ROUTE-009
  Scenario: A newly registered action appears without a browser or policy migration
    Given the server snapshot adds the labelled Security Review action
    When the operator inspects the Review group
    Then Security Review appears once as Inherit with server-supplied effective facts
    And no read-time mutation or browser hierarchy synthesis occurs

  @E011-PROV-003 @E011-ROUTE-003
  Scenario: Reset attention and revision conflict preserve drafts without unsafe claims
    Given failed-catalog attention identifies a removed route and safe reason
    And one row has an unsaved draft
    When the operator acknowledges the notice and a later Save reports a revision conflict
    Then acknowledgement changes no policy revision and preserves the draft
    And the conflict alert receives focus with an explicit reload-and-compare action
    And no raw server failure, credential, or actual-worker claim enters browser sinks

  @accessibility @security
  Scenario: Safe states remain accessible at reduced motion and constrained width
    Given the initial matrix read is pending and then returns malformed data
    When the operator retries with a valid complete snapshot at constrained width
    Then loading and read failure use bounded accessible status
    And native labelled controls remain keyboard reachable at reduced motion
    And long route identities wrap without a horizontal page trap
