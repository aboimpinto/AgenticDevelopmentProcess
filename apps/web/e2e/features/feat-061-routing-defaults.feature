@EPIC-011 @FEAT-061 @playwright @deterministic
Feature: Routing Defaults policy safety
  As a Hepha operator
  I want server-authoritative routing defaults to be visible and safe
  So that a future worker route never depends on a browser fallback

  Background:
    Given a deterministic registered-action routing fixture
    And the Models Routing Defaults tab is open

  @E011-ROUTE-002
  Scenario: The routing table presents the server-calculated inherited route
    Given Global Default is configured and Code Review inherits its action-type route
    When the operator views Code Review in Routing Defaults
    Then its effective route identifies the action-type connection and model
    And its policy source is action_type

  @E011-ROUTE-004
  Scenario: An ineligible action route is refused without a policy revision
    Given Code Review requires tools and a 64000 token context window
    And an available route lacks those requirements
    When the operator attempts to select the ineligible route for Code Review
    Then the route is not saved and the policy revision remains unchanged
    And the Models page explains the missing tool support, API compatibility, and 64000 token context window
    And the browser presents no credential, worker receipt, or local fallback

  @E011-SAFE-002
  Scenario: A rejected fallback loop presents no browser fallback
    Given Code Review has a valid current inherited route
    When the routing service rejects a cyclic policy mutation
    Then the browser presents the server rejection
    And no browser fallback route is calculated

  @E011-SAFE-003 @E011-PROV-003
  Scenario: Reset attention and Global deletion safety remain visible without runtime claims
    Given a failed non-Global route has durable unacknowledged attention
    When the operator acknowledges the attention
    Then the attention is removed from the current routing view
    And the page explains that a Global Default connection requires a replacement before deletion
    And no worker receipt, secret, token, or actual worker activity is presented
