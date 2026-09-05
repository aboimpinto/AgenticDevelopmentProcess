@EPIC-011 @FEAT-worker-injection @playwright @deterministic
Feature: Actual worker runtime evidence in FEAT Details
  As a Hepha operator
  I want each phase to show guarded durable execution evidence
  So that planned routing is never confused with what actually ran

  Background:
    Given FEAT Details is open with deterministic runtime receipt fixtures
    And no real provider, Pi session, vault, or credential is used

  @E011-EVID-001 @E011-NEST-001
  Scenario: A completed phase lazily shows actual root and nested invocations
    Given the phase summary contains an Implementation invocation and a parent-linked Code Review invocation
    When the operator expands the phase and loads the next bounded evidence page
    Then the summary shows both actual routes, two invocations, their final outcome, and aggregate measured duration
    And each invocation shows action, role, prompt, revision, timestamps, measured duration, and executed route
    And the nested Code Review shows its independently approved route and parent and root lineage
    And no chain detail was requested before the disclosure opened

  @E011-EVID-002
  Scenario: FEAT Details distinguishes not-yet-run, legacy-not-recorded, and failed evidence
    Given one phase has not started, one has legacy activity only, and one has a failed current receipt
    When the operator views the ordered phase summaries and expands the failed phase
    Then the empty phase is labelled "Not yet run"
    And the legacy phase is labelled "Not recorded" without an inferred actual model
    And the failed phase shows its actual attempted route, safe failure reason, and measured duration

  @E011-EVID-003 @E011-FAIL-001 @E011-FAIL-002
  Scenario: A successful fallback remains distinct from the failed planned primary after refresh
    Given a planned primary failed before substantive work and the approved second route completed once
    When the operator expands and refreshes the phase evidence
    Then the approved primary remains visible as planned and failed
    And the successful fallback remains visible as the actual executed route
    And route-change history shows the classified reason, both routes, timestamps, durations, and terminal result
    And no third attempt or recursive route is presented

  @E011-FAIL-003 @E011-FAIL-004 @E011-FAIL-005
  Scenario: Terminal and checkpoint-recovery histories expose only the legal route sequence
    Given one phase has a terminal one-attempt failure and another has a checkpoint-bound recovery
    When the operator expands both phase disclosures
    Then the terminal phase shows no approved or executed substitute
    And the recovery phase shows one checkpointed primary and one recovery attempt
    And the recovery history preserves the checkpoint evidence and one terminal route-change edge

  @E011-ROUTE-003
  Scenario: A policy revision change affects only the next invocation
    Given one completed invocation used revision 41 and its pinned implementation route
    And the next independently planned invocation used revision 42 and a later route
    When the operator loads both invocation pages
    Then both immutable revisions and their own executed routes remain visible
    And the older invocation is not rewritten to the later route

  @E011-EVID-001 @security @sse
  Scenario: Card-correlated live invalidation commits runtime evidence atomically and leaks no secret
    Given an open phase has a last confirmed secret-free runtime snapshot
    When a card-correlated live event triggers a refresh whose detail page fails validation
    Then the last confirmed summary and open detail remain visible as stale
    And no payload claim or partially staged route becomes runtime evidence
    When the operator retries after every guarded response succeeds
    Then the new summary and open detail replace the stale snapshot together
    And no distinctive test secret appears in responses, network requests, visible text, accessible attributes, or browser console output
