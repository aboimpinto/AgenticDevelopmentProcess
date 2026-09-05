@EPIC-011 @FEAT-worker-injection @integration
Feature: Pinned plan-bound Pi worker launch
  As a Hepha operator
  I want each isolated Pi attempt to execute only its approved route
  So that authentication and runtime evidence remain trustworthy

  @E011-PROV-004 @E011-ROUTE-001 @E011-ROUTE-005 @WF-RUNTIME-PLAN-EXECUTE @WF-RUNTIME-RECEIPT-SETTLE
  Scenario: An accepted Pi Session plan launches unchanged without a copied key
    Given a validated bootstrap handoff plan for an authenticated Pi Session
    When the public one-attempt executor launches its primary step
    Then the process receives the exact provider and model from the plan
    And the receipt retains the accepted policy revision
    And the HEPHA vault is not read

  @E011-LAUNCH-001 @E011-LAUNCH-004
  Scenario: A selected connection secret is launch-scoped and version-pinned
    Given a validated handoff plan for an active custom connection
    When the public one-attempt executor launches its primary step
    Then the selected secret is read once after non-secret preparation
    And only the child environment receives the selected secret
    And arguments, isolated metadata, and receipts contain no secret value
    And the receipt retains the launch-time credential version
    And the isolated context is removed after the terminal result

  @E011-LAUNCH-002
  Scenario: Parallel plan-bound attempts remain isolated
    Given two validated handoff plans with different routes and credentials
    When both public one-attempt executions overlap
    Then their configuration roots and session contexts are distinct
    And each process observes only its own model and credential
    And each receipt records only its own approved route

  @WF-RUNTIME-LAUNCH-REJECT
  Scenario: Malformed and unavailable launch inputs cannot invent a route
    Given malformed plan context or an unavailable approved connection
    When the public one-attempt executor evaluates the launch
    Then malformed input creates no receipt, filesystem, vault, or process side effect
    And unavailable valid input records a safe preparation failure without an actual route
    And no default, model-key, or substitute route is used

  @E011-FAIL-001 @E011-FAIL-002 @WF-RUNTIME-FALLBACK
  Scenario: A pre-substantive primary failure consumes the approved second route once
    Given a validated two-step plan whose primary attempt has durable work state none
    When the public runtime coordinator receives a safe primary failure
    Then one fallback attempt executes the exact second route
    And no policy resolution, recursive fallback, or third attempt occurs

  @E011-FAIL-006 @WF-RUNTIME-FALLBACK @WF-RUNTIME-RECEIPT-SETTLE
  Scenario: A successful fallback owns its mutations and completes the worker
    Given a validated two-step plan whose primary provider identity cannot be resolved
    When the approved fallback emits a successful artifact mutation and completes
    Then the primary provider_unsupported failure remains durable on the primary attempt
    And the fallback attempt owns the mutation checkpoint and completed actual route
    And the route-change event records a completed fallback caused by provider_unsupported
    And the invocation and worker complete successfully without failing the phase

  @WF-RUNTIME-LAUNCH-REJECT
  Scenario: An unstartable route exposes its cause and recovery
    Given a one-step plan selects an endpoint with no safely resolved provider identity
    When primary preparation fails before process spawn
    Then the durable provider_unsupported cause identifies the failed route
    And the operator sees that no fallback is configured
    And the operator is directed to Agent Routing before retrying the same action

  @E011-FAIL-003 @E011-FAIL-004 @WF-RUNTIME-TERMINAL
  Scenario: A plan without a legal runtime second hop terminates without workflow advance
    Given a one-step Global plan or a primary attempt started without a checkpoint
    When the public runtime coordinator receives a safe primary failure
    Then no substitute worker starts
    And the invocation settles as terminal without advancing a later workflow transition

  @E011-FAIL-005 @WF-RUNTIME-RECOVERY
  Scenario: A checkpointed primary failure hands off without replay
    Given durable work evidence identifies the checkpoint, unresolved cursor, and completed tasks
    When the public runtime coordinator receives a later primary failure
    Then one recovery attempt receives the authorized checkpoint context
    And completed task identities are preserved without replay
    And malformed or missing checkpoint evidence cannot downgrade to fallback

  @WF-DIRECT-HOST-NO-LAUNCH
  Scenario: A matching direct command executes its source worker once
    Given the user invokes a portable skill in an existing coding-agent session
    When the direct host executes the procedure
    Then the procedure remains in that host without a policy query or handoff event
    And no orchestrated child process or receipt is created

  @E011-LAUNCH-003 @WF-DIRECT-HOST-NO-LAUNCH
  Scenario: A direct session mismatch transfers before source-session worker work
    Given the superseded mismatch-transfer contract is retained only as negative historical evidence
    When the user invokes the portable procedure without an explicit Hepha launcher
    Then the procedure remains in the current host and does not transfer
    And Hepha records no orchestrated receipt or route-change event

  @E011-NEST-001 @E011-NEST-002 @E011-NEST-003 @E011-NEST-004 @WF-RUNTIME-NESTED-DISPATCH
  Scenario: Nested specialists execute independently planned parent-linked chains
    Given review and knowledge actions each resolve their own accepted plan
    When the production review and knowledge lifecycle boundaries execute each scoped action
    Then each invocation starts with a primary attempt on its own approved route
    And parent, root, correlation, and selected lesson identities are durable
    And curator scope does not reopen a completed feature or export to Second Brain

  @E011-NEST-001 @WF-RUNTIME-RESUMED-SPECIALIST
  Scenario: A resumed specialist starts honestly when the new run has no parent invocation
    Given a durable workflow resumes directly at a declared specialist task in a new run
    And no model invocation has executed in that run
    When the production specialist lifecycle dispatches its independently approved action
    Then one fully scoped root specialist chain executes with the current run and task identity
    And Hepha creates no fake parent receipt or unrelated worker invocation

  @E011-NEST-004 @WF-RUNTIME-NESTED-DISPATCH
  Scenario: Post-complete curation waits for a successful completion receipt
    Given a detached completion worker has a parent-linked terminal receipt
    When the production detached lifecycle observes successful feature completion
    Then one post-complete curator resolves and executes through its nested route
    And its input is project-only with no feature reopen or Second Brain export
    But a failed completion receipt starts no curator
