# EPIC-011 Acceptance Tests: Model Catalog And Hierarchical Action Routing

These Gherkin scenarios are the acceptance-test source for EPIC-011 child
FEATs. A child FEAT must copy the scenarios it implements into a focused
`apps/web/e2e/features/feat-<id>-*.feature` file, implement the matching
Playwright test, and link its phase evidence to the scenario IDs.

The tests use deterministic Hepha fixtures: fake provider discovery endpoints,
a fake clock, and a fake Pi launch adapter. They must never call a real model
provider or use a real credential. The fake launch adapter records sanitized
launch metadata and may assert whether a secret was supplied through the child
process environment; it must never expose the secret in browser content,
console output, snapshots, traces, or assertions.

## Coverage And Test-Layer Rules

- Browser-visible routing, warning, Details, and recovery behaviour requires
  Playwright coverage driven through the dashboard.
- Resolver precedence, loop prevention, policy revision, secret transport,
  isolated configuration roots, and parallel launch safety also require focused
  orchestrator integration tests. Playwright may inspect their resulting
  dashboard evidence but is not a substitute for those tests.
- Every route fixture identifies a connection by immutable `connectionId` and a
  `modelId`; display names are deliberately non-unique in selected scenarios.
- Every orchestrated launch fixture records a policy revision, action ID, agent
  role/prompt version, start/end timestamps, and a sanitized authentication
  connection ID.
- Direct-host skill fixtures for Pi, Codex, and Claude Code assert that no model
  switch, route query, automatic handoff, or orchestrated receipt occurs.
- Static asset tests inspect the production workflow, command, agent, and skill
  inventories rather than one prepared example asset.

## Provider Connections And Catalog

```gherkin
@EPIC-011 @FEAT-provider-connections @playwright
Feature: Provider connections and model catalog
  As a Hepha operator
  I want to inspect safe, current model connections
  So that I can select a model route with enough information to trust it

  Background:
    Given a registered project "HEPHA" with deterministic model-provider fixtures
    And the Models page is open

  @E011-PROV-001
  Scenario: An operator sees enough metadata to choose between available models
    Given connection "openai-personal" exposes model "gpt-test" with tool support and a 128000 token context window
    And connection "openrouter-team" exposes model "gpt-test" with a different endpoint and pricing metadata
    When the operator selects "openrouter-team / gpt-test" in Available Models
    Then the selected model shows its connection label and endpoint identity
    And the selected model shows availability, last scan time, context window, output limit, modalities, reasoning controls, tool compatibility, and supplied pricing
    And the routing selector distinguishes "openai-personal / gpt-test" from "openrouter-team / gpt-test"

  @E011-PROV-002
  Scenario: A custom provider key is never exposed while its models are scanned
    When the operator saves a custom OpenAI-compatible connection with a test secret
    Then the provider key field is masked
    And no Models-page response, visible text, browser console event, trace, or receipt contains the test secret
    When the scan succeeds with model "gemini-test"
    Then "gemini-test" is selectable through that connection

  @E011-PROV-003
  Scenario: A failed scan removes a stale catalog and surfaces actionable recovery
    Given connection "provider-a" previously exposed model "model-a"
    And Code Review explicitly routes to "provider-a / model-a"
    When a refresh scan for "provider-a" fails with "payment required"
    Then "model-a" is no longer selectable
    And the Models page shows "payment required" for "provider-a"
    And Code Review is shown as inherited from the Global Default
    And a durable attention warning identifies the failed connection, model, reason, policy revision, and timestamp

  @E011-PROV-004
  Scenario: An authenticated Pi Session supplies models without a copied key
    Given the configured Pi Session exposes "openai / pi-session-model" through its model catalog
    When the operator refreshes the Pi Session connection
    Then "openai / pi-session-model" is selectable with connection label "Pi Session"
    And no API-key field or persisted Pi token is shown or created
    When a worker launches through that Pi Session connection
    Then the launch receipt identifies the Pi Session connection
    And the fake launch adapter observes no HEPHA-injected provider secret

  @E011-PROV-005
  Scenario: A custom-provider redirect cannot receive its API key
    Given custom connection "provider-a" has a stored test secret
    And its model scan responds with a redirect to a different host
    When HEPHA scans "provider-a"
    Then the scan fails with a redirect-security diagnostic
    And the redirected host receives no authorization header or test secret
    And no stale provider-a model remains selectable

  @E011-PROV-006
  Scenario: An upgrade reconciles every active connection that was never scanned
    Given active Pi Session connections "OpenAI" and "DeepSeek" predate catalog reconciliation
    And only "OpenAI" has catalog rows or scan diagnostics
    When HEPHA starts with catalog reconciliation version "2"
    Then "DeepSeek" is scanned exactly once
    And models from both active connections are visible with their connection labels
    And restarting HEPHA does not automatically scan either reconciled connection again

  @E011-PROV-007
  Scenario: Active connections without model rows remain visible and actionable
    Given "provider-empty" completed a successful scan with zero models
    And "provider-failed" has a safe failed-scan diagnostic
    And "provider-new" has never been scanned
    When the operator opens Available Models
    Then all three active connections are represented
    And their scan states are "Empty", "Failed", and "Never scanned" respectively
    And the operator can retry the failed or never-scanned connection without affecting the other connection states
```

## Bootstrap, Inheritance, And Audit

```gherkin
@EPIC-011 @FEAT-routing-resolver @playwright
Feature: Deterministic routing policy
  As a Hepha operator
  I want every action route to be explainable and auditable
  So that a worker never uses an accidental model

  @E011-ROUTE-001
  Scenario: The first explicit Hepha launch automatically establishes the Global Default
    Given no Global Default has been stored
    And an explicit Hepha launcher receives a validated Pi session route "openai-personal / gpt-test"
    When the launcher starts its first orchestrated HEPHA action
    Then the Global Default becomes "openai-personal / gpt-test" without a confirmation dialog
    And a bootstrap policy revision records the session connection identity and timestamp without recording a credential

  @E011-ROUTE-002
  Scenario Outline: The routing table explains effective inheritance
    Given Global Default is "openai-personal / global-model"
    And the "<actionType>" action type is "<typeRoute>"
    And the "<action>" action is "<actionRoute>"
    When the operator views the route for "<action>"
    Then the effective route is "<effectiveRoute>"
    And the policy source is "<policySource>"

    Examples:
      | actionType              | typeRoute                         | action              | actionRoute                           | effectiveRoute                         | policySource |
      | Review                  | Inherit                           | Code Review         | Inherit                               | openai-personal / global-model         | Global        |
      | Review                  | openrouter-team / review-model    | Code Review         | Inherit                               | openrouter-team / review-model         | Action type   |
      | Review                  | openrouter-team / review-model    | Code Review         | anthropic-team / audit-model          | anthropic-team / audit-model            | Action        |
      | Knowledge & Documentation | openai-personal / knowledge-model | Phase Lessons Capture | Inherit                             | openai-personal / knowledge-model       | Action type   |

  @E011-ROUTE-003
  Scenario: A policy change affects only a future worker
    Given an Implementation worker is running with policy revision "41" and model "implementation-v1"
    When the operator changes the Implementation action route to "implementation-v2"
    Then the running worker remains recorded as "implementation-v1" at revision "41"
    When the next Implementation worker starts
    Then it uses "implementation-v2" and a later policy revision
    And both launch records are visible in the related FEAT Details view

  @E011-ROUTE-004
  Scenario: An ineligible model cannot be saved as an action route
    Given Code Review requires tool support and a 64000 token context window
    And "provider-a / small-text-model" lacks both requirements
    When the operator selects "provider-a / small-text-model" for Code Review
    Then the Models page explains each unmet capability
    And the route cannot be saved or dispatched

  @E011-ROUTE-005
  Scenario: The first Web UI launch seeds Global Default from Pi Session without asking
    Given no Global Default has been stored
    And the installation Pi Session default route is "openai / pi-session-model"
    When the operator starts Deep-Dive from the dashboard
    Then Global Default becomes "openai / pi-session-model" without a confirmation dialog
    And the Deep-Dive worker is launched with the seeded route and bootstrap policy revision

  @E011-ROUTE-006
  Scenario: A Global-only policy projects the complete canonical registry
    Given the persisted policy contains only Global Default
    And the canonical registry contains 5 action types and 17 actions
    When the operator opens Routing Defaults
    Then the page shows Global Default, 5 action-type rows, and 17 action rows
    And every non-global row is configured as "Inherit"
    And every row shows its effective route and policy source

  @E011-ROUTE-007
  Scenario: Implementation actions are visible and independently configurable
    Given Global Default is "openai-personal / global-model"
    And the Implementation type and its actions inherit
    When the operator opens the Implementation routing group
    Then Start Feature and Continue Implementing are both visible
    And Phase Worker, Resolve Review Findings, and Workflow Recovery are visible
    When the operator routes Implementation to "deepseek-team / implementation-model"
    And routes Continue Implementing to "openai-personal / continuation-model"
    Then Start Feature resolves from Action type to "deepseek-team / implementation-model"
    And Continue Implementing resolves from Action to "openai-personal / continuation-model"

  @E011-ROUTE-008
  Scenario: The operator configures a safe non-global failure policy
    Given Code Review routes to "openai-work / review-model"
    When the operator selects "Reroute once to Global Default" and saves
    Then a new immutable policy revision records the Code Review route and failure policy
    And selecting its primary route as an explicit fallback is rejected without another revision

  @E011-ROUTE-009
  Scenario: A new registry action appears without a policy migration
    Given the persisted policy predates registered action "security-review"
    And "security-review" belongs to action type "Review"
    When the operator opens Routing Defaults
    Then Security Review appears under Review as "Inherit"
    And its effective route and policy source are resolved without writing a policy revision

  @E011-ROUTE-010
  Scenario: Human labels do not replace immutable route identity
    Given connection ID "connection-uuid-a" has label "DeepSeek Team"
    And it exposes model "deepseek-v4-pro"
    When the operator configures Start Feature
    Then the selector presents "DeepSeek Team / deepseek-v4-pro"
    And the saved policy and runtime receipt retain "connection-uuid-a / deepseek-v4-pro"
    And the UUID is not used as the primary human label
```

## Launch Isolation And Direct Host Execution

```gherkin
@EPIC-011 @FEAT-worker-injection @integration
Feature: Pinned Pi worker launch
  As a Hepha operator
  I want each Pi worker to receive only its selected connection
  So that custom keys and concurrent work remain safe

  @E011-LAUNCH-001
  Scenario: HEPHA supplies an unlogged-in provider key without changing the user's Pi configuration
    Given "gemini-work" is a configured connection with a stored test secret
    And the user has no Gemini login in their normal Pi configuration
    And Deep-Dive resolves to "gemini-work / gemini-test"
    When HEPHA launches the Deep-Dive worker
    Then the Pi command contains "--provider" and "--model" but no API key argument
    And the fake worker receives the test secret only through its child-process environment
    And its unique Pi configuration root contains an environment-variable reference but not the test secret
    And the user's normal Pi configuration root is unchanged
    And the completed worker configuration root is cleaned up

  @E011-LAUNCH-002
  Scenario: Parallel custom-provider workers keep configuration and credentials isolated
    Given an Implementation worker resolves to "gemini-work / gemini-test"
    And a Code Review worker resolves to "openrouter-work / review-test"
    When both workers are launched in parallel
    Then each worker has a different Pi configuration root and session context
    And neither worker can observe the other worker's secret or model configuration
    And each receipt records only its own connection and model

  @E011-LAUNCH-003
  Scenario: A directly invoked skill preserves the active Pi model
    Given the current direct Pi session uses "openai-personal / global-model"
    And Hepha policy routes Code Review to "anthropic-team / audit-model"
    When the user invokes the Code Review skill directly in the current Pi session
    Then the skill continues in the current Pi session on "openai-personal / global-model"
    And the skill does not query routing policy, switch models, or create a route-mismatch handoff
    And Hepha does not create an orchestrated invocation receipt for that direct run

  @E011-LAUNCH-004
  Scenario: Credential rotation affects only future workers and remains secret-safe
    Given an Implementation worker is running through connection "gemini-work" at credential version "1"
    When the operator rotates the stored key for "gemini-work" to credential version "2"
    Then no secret value appears in the Models page, event history, trace, or receipt
    And the running worker remains associated with credential version "1"
    When the next Implementation worker starts through "gemini-work"
    Then it receives only credential version "2" through its child-process environment
    And both receipt records retain their own connection and credential-version audit metadata

  @E011-LAUNCH-005
  Scenario Outline: A portable direct skill preserves the coding-agent model
    Given the user selected model "<model>" in an existing "<host>" session
    And the portable Start Feature skill contains no model routing field
    When the user invokes Start Feature directly
    Then the skill remains in the current "<host>" session
    And it does not request a model switch, query Hepha routing policy, or create an orchestrated receipt

    Examples:
      | host        | model                |
      | Pi          | openai / current-pi  |
      | Codex       | current-codex        |
      | Claude Code | current-claude       |
```

## Portable Asset And Model Authority Contract

```gherkin
@EPIC-011 @FEAT-portable-skills @integration
Feature: Portable model-neutral Hepha assets
  As a Hepha user
  I want model authority to belong to the selected execution mode
  So that reusable skills never compete with routing policy or my coding-agent selection

  @E011-ASSET-001
  Scenario: Managed assets reject embedded routing choices
    Given the production workflow, command, agent, and lifecycle-skill inventories
    When Hepha validates their model-authority contract
    Then no managed asset contains provider, model, model ID, or model-policy routing fields
    And every orchestrated worker node maps to exactly one registered action ID

  @E011-ASSET-002
  Scenario: Claude Code skill frontmatter cannot override the direct session model
    Given a Hepha lifecycle skill is available to Claude Code
    When the portable skill contract is validated
    Then its frontmatter omits Claude Code "model" and routing "effort" overrides
    And direct invocation inherits the active Claude Code session model

  @E011-ASSET-003
  Scenario: Orchestration injects policy without changing the skill
    Given Start Feature resolves to "deepseek-team / implementation-model"
    And the Pi installation default is "openai-personal / default-model"
    When Hepha orchestrates Start Feature with the portable skill
    Then the Pi adapter launches with "deepseek-team / implementation-model"
    And the skill receives no route or credential selection responsibility
    And the receipt records the approved and actual route with its policy revision

  @E011-ASSET-004
  Scenario: Direct execution never fabricates actual model evidence
    Given a direct Codex session runs Continue Implementing
    And no trusted host instrumentation reports its actual model to Hepha
    When Hepha projects the related workflow evidence
    Then the direct run is identified as direct-host execution
    And its actual model is "Not recorded"
    And no Global or action route is displayed as the actual direct-run model
```

## Runtime Model And Timing Evidence

```gherkin
@EPIC-011 @FEAT-worker-injection @playwright
Feature: Actual model and elapsed-time evidence in FEAT Details
  As a Hepha operator
  I want phase Details to show what actually ran and how long it took
  So that model policy is auditable rather than a prediction

  @E011-EVID-001
  Scenario: A completed phase shows every actual invocation and its elapsed time
    Given Phase 3 has a completed Implementation invocation through "deepseek-work / implementation-model"
    And the Implementation invocation started at "10:00:00" and ended at "10:03:30"
    And Phase 3 has a completed nested Code Review invocation through "openai-work / review-model"
    And the Code Review invocation started at "10:03:45" and ended at "10:05:00"
    When the operator opens the related FEAT Details and expands Phase 3
    Then the phase summary shows the actual models "deepseek-work / implementation-model" and "openai-work / review-model"
    And the phase summary shows two invocations, their outcomes, and the measured aggregate elapsed time
    And each invocation shows action, agent role/prompt version, connection/model, policy revision, start timestamp, end timestamp, and measured duration
    And no planned route, document timestamp, API key, or token is presented as an actual runtime fact

  @E011-EVID-002
  Scenario: Phase Details distinguish absent, legacy, and failed runtime evidence
    Given Phase 2 has not started and has no invocation receipt
    And Phase 4 is imported legacy work with a phase document model label but no invocation receipt
    And Phase 5 has a failed worker receipt with a measured duration
    When the operator opens the related FEAT Details
    Then Phase 2 is labelled "Not yet run"
    And Phase 4 is labelled "Not recorded" rather than claiming its document model was used
    And Phase 5 is labelled "Failed" with its actual attempted connection/model, failure reason, and measured duration

  @E011-EVID-003
  Scenario: Details separate planned primary routing from a successful fallback route
    Given Code Review was planned for "provider-a / review-model" under policy revision "51"
    And that primary launch failed with "payment required"
    And its configured fallback completed through "openai-work / global-model" under the recorded fallback policy
    When the operator opens the Code Review phase Details
    Then the planned primary route remains visible as planned and failed
    And "openai-work / global-model" is visible as the actual successful route
    And the route-change history shows both attempts, their timestamps, durations, and classified reason
```

## Automatic Failure Rerouting

```gherkin
@EPIC-011 @FEAT-routing-resolver @FEAT-worker-injection @playwright
Feature: Automatic failure rerouting
  As a Hepha operator
  I want configured model failures to recover automatically when allowed
  So that work continues without hiding what happened

  @E011-FAIL-001
  Scenario: A non-global route automatically falls back once to Global Default
    Given Global Default is "openai-personal / global-model"
    And Code Review routes to "provider-a / review-model"
    And Code Review has failure policy "Reroute once to Global Default"
    When the Code Review launch fails with "payment required" before substantive work
    Then one replacement Code Review worker launches with "openai-personal / global-model"
    And FEAT Details shows the failed primary route, classified reason, fallback route, policy revision, start timestamp, end timestamp, and final outcome
    And no second fallback worker is launched

  @E011-FAIL-002
  Scenario: A configured explicit fallback is used instead of Global Default
    Given Global Default is "openai-personal / global-model"
    And Deep-Dive routes to "provider-a / primary-model"
    And Deep-Dive has failure policy "Reroute once to provider-b / fallback-model"
    When the primary Deep-Dive launch fails with "rate limited"
    Then the replacement worker launches once with "provider-b / fallback-model"
    And the route history remains visible after a dashboard refresh

  @E011-FAIL-003
  Scenario: A fail-immediately route does not start a substitute worker
    Given Design Feature routes to "provider-a / design-model"
    And Design Feature has failure policy "Fail immediately"
    When its launch fails with "authentication failed"
    Then no replacement worker is launched
    And the workflow is blocked with the recorded failure reason and route history

  @E011-FAIL-004
  Scenario: Global Default failure is terminal
    Given Implementation resolves to Global Default "provider-a / global-model"
    When the Global Default launch fails with "provider unavailable"
    Then no fallback worker is launched
    And the workflow does not continue to a later phase
    And FEAT Details shows the terminal Global Default failure

  @E011-FAIL-005
  Scenario: A post-start failure creates a recovery handoff rather than replaying work
    Given an Implementation worker has recorded a phase checkpoint after substantive work
    And its configured failure policy reroutes once to Global Default
    When its provider fails during a later request
    Then HEPHA records the failed worker and creates a recovery handoff
    And the fallback worker receives the phase checkpoint and prior-run evidence
    And the fallback worker does not replay completed phase tasks
```

## Independently Routed Nested Workers And LessonsLearned

```gherkin
@EPIC-011 @FEAT-worker-injection @playwright
Feature: Nested worker routing and knowledge-aware workflows
  As a Hepha operator
  I want nested specialists to follow their own policy and selected lessons
  So that review and knowledge work are neither hidden nor forced onto the parent model

  @E011-NEST-001
  Scenario: Code Review uses its own route rather than the Implementation route
    Given Implementation routes to "deepseek-work / implementation-model"
    And Code Review routes to "openai-work / review-model"
    When an implementation phase reaches its review gate
    Then the Implementation receipt records "deepseek-work / implementation-model"
    And the nested Code Review receipt records "openai-work / review-model"
    And the Code Review receipt links to the parent phase and Implementation invocation

  @E011-NEST-002
  Scenario Outline: LessonsLearned workers independently resolve their routes
    Given "<action>" resolves to "<route>"
    When "<action>" is launched for feature "FEAT-011-fixture"
    Then its receipt records action "<action>", route "<route>", and its parent correlation
    And it does not inherit the parent Implementation model

    Examples:
      | action                            | route                                  |
      | Phase Lessons Capture              | openai-work / phase-lessons-model      |
      | Feature Lessons Writer             | deepseek-work / feature-lessons-model  |
      | Post-Complete LessonsLearned Curator | openrouter-work / curator-model      |

  @E011-NEST-003
  Scenario: Refinement uses a selected active lesson to add a required phase
    Given the project active lessons include rule "required-security-audit-phase"
    And that rule requires a "Security Audit" phase immediately after Planning
    When the operator runs Refine Feature for a clarified feature
    Then the generated phase plan contains "Security Audit" immediately after Planning
    And the refinement receipt records "required-security-audit-phase"
    And the planning artifact explains the added phase and its source lesson

  @E011-NEST-004
  Scenario: The post-complete curator changes project active rules but does not export to Second Brain
    Given a completed feature has a raw per-feature lessons document
    When the Post-Complete LessonsLearned Curator completes
    Then the matching project `LessonsLearned/Active` rule is created, updated, merged, or superseded with source references
    And the completed feature is not reopened
    And no cross-project Second Brain candidate or export is created
```

## Policy and Secret Regression Checks

```gherkin
@EPIC-011 @FEAT-routing-resolver @integration
Feature: Routing policy safety invariants
  As a Hepha maintainer
  I want invalid routing configurations rejected deterministically
  So that automated recovery cannot become ambiguous or unsafe

  @E011-SAFE-001
  Scenario: The resolver rejects an unavailable route before worker dispatch
    Given Code Review explicitly routes to unavailable "provider-a / model-a"
    And Code Review has no valid automatic fallback
    When HEPHA resolves Code Review
    Then no Pi worker is spawned
    And the result names the unavailable connection/model and actionable recovery state

  @E011-SAFE-002
  Scenario: The routing editor prevents fallback loops
    Given Code Review primary route is "provider-a / primary-model"
    When the operator attempts to set its fallback to the same route or a cyclic route
    Then the routing configuration is rejected
    And the existing valid policy revision remains active

  @E011-SAFE-003
  Scenario: A provider connection cannot be deleted while it owns Global Default
    Given "provider-a / global-model" is Global Default
    When the operator attempts to delete "provider-a"
    Then the provider remains configured
    And the Models page explains that a replacement Global Default is required
```

## Child-FEAT Traceability

| Scenario group | Primary child FEAT | Required evidence |
|---|---|---|
| Provider Connections And Catalog | FEAT-058, FEAT-059, FEAT-060; corrective FEAT-069 | Playwright UI, migration/startup integration, provider adapter, scan-state, and secret-redaction tests |
| Bootstrap, Inheritance, And Audit | FEAT-061; corrective FEAT-070 | Complete-registry resolver/API integration plus Global-only routing-matrix Playwright coverage |
| Launch Isolation And Direct Host Execution | FEAT-062; corrective FEAT-071 | Spawn-adapter isolation, deterministic direct-host fixtures, model-neutral asset checks, and receipt UI coverage |
| Portable Asset And Model Authority | FEAT-071 | Production inventory validation, Pi/Codex/Claude Code compatibility fixtures, and orchestrated Pi injection integration |
| Runtime Model And Timing Evidence | FEAT-062; corrective FEAT-071 for direct-host distinction | Receipt/phase-projection integration plus FEAT Details Playwright coverage |
| Automatic Failure Rerouting | FEAT-061, FEAT-062; editor completion FEAT-070 | Policy tests, recovery integration, failure-policy editor, and FEAT Details Playwright coverage |
| Nested Workers And LessonsLearned | FEAT-061, FEAT-062 | Nested-launch integration, receipt/Details Playwright coverage, workflow fixture tests |
| Policy and Secret Regression Checks | FEAT-058, FEAT-061; corrective FEAT-070/071 | Negative policy, asset-authority, and security integration coverage |

## Historical Completion And Reopening Evidence

EPIC-011 was originally marked completed on 2026-07-24 after FEAT-058 through
FEAT-062 reached `04_COMPLETED`. Their completion reports and executable evidence
remain valid for the bounded behavior they actually prove.

Production inspection on 2026-07-24 reopened the EPIC because those suites did
not cover an existing active unscanned connection, a real Global-only policy
projected against the complete canonical registry, or the direct-host versus
orchestrated model-authority distinction. E011-LAUNCH-003 was deliberately
revised: automatic handoff is no longer the default for direct skill execution.
FEAT-069 through FEAT-071 own the new and revised scenario remainder. EPIC-011
must not return to Completed until all eight child FEATs are completed and the
corrective scenarios above have exact evidence.
