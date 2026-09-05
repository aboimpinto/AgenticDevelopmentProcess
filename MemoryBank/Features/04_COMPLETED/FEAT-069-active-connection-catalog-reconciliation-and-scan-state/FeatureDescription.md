# FEAT-069: Active Connection Catalog Reconciliation And Scan State

**Feature ID**: FEAT-069  
**Parent Epic**: EPIC-011  
**Status**: Completed
**Priority**: P1  
**Owner**: Paulo Aboim Pinto  
**External Reference**: `docs/architecture/epic-011-model-authority-and-portable-skill-execution.md`

## Summary

Ensure every active provider connection is represented by an honest,
operator-visible catalog scan state and reconcile active connections that
predate model-catalog discovery. This closes the production gap where OpenAI
and DeepSeek were both configured but startup scanned only the Pi installation
default connection, leaving DeepSeek absent from Available Models until a
manual scan.

## Source

- EPIC: EPIC-011 - Model Catalog And Hierarchical Action Routing
- Corrective feature created after production inspection of the completed
  FEAT-059/060/062 path.

## Problem And Evidence

`apps/orchestrator/src/index.ts` currently scans the discovered Pi installation
default only when that route is not cataloged. An existing active connection
with neither catalog rows nor diagnostics is otherwise invisible in Available
Models. The live installation demonstrated this state: OpenAI had seven
catalog rows while the active DeepSeek connection had no rows and no diagnostic.
A manual `scan-active` call discovered two DeepSeek models immediately.

The scanner and `scanAllActiveConnections()` already support both connections;
the missing capability is migration/reconciliation state, coordinated scan
execution, and UI disclosure. Without it, operators cannot tell the difference
between an inactive connection, an unscanned connection, an empty provider
catalog, and a failed scan. Routing selectors also cannot offer a model that
was never reconciled.

## User And Workflow Use

This feature is used when:

- Hepha starts after upgrading an installation that already contains provider
  connections;
- an operator opens Provider Connections or Available Models;
- an operator adds, materially changes, or re-enables a connection;
- an operator retries one connection or invokes Scan Models for all active
  scannable connections;
- routing validation needs to know whether a missing model is unavailable or
  merely undiscovered;
- Global Default references a connection whose catalog cannot be validated.

The primary user is the Hepha operator configuring the models later consumed
by Deep-Dive, planning, implementation, review, completion, and lessons workers.

## Product Decisions

### Durable Reconciliation Authority

- A dedicated, machine-owned reconciliation ledger record exists for every
  provider connection.
- The per-connection ledger is the durable authority for reconciliation
  version, current scan state, trigger, attempt boundaries, and settled
  outcome.
- Startup eligibility is determined from the ledger together with existing
  catalog and diagnostic evidence. Versioned startup reconciliation targets
  active connections that have neither a stored catalog result nor a
  diagnostic for the applicable reconciliation version.
- The scan coordinator atomically claims a connection in the ledger before
  provider I/O begins.
- Interrupted claimed attempts are settled deterministically without making
  repeated provider contacts on subsequent startups. A crash must not leave a
  connection indefinitely eligible for automatic startup retries.
- A recorded successful, empty, or failed outcome prevents repeated automatic
  scans for the same reconciliation version.
- Reconciliation records and diagnostics must remain secret-safe and must not
  contain credentials, authorization headers, or secret-bearing provider
  responses.

### Scan States

- Every active connection has one server-projected visible scan state even when
  it has zero catalog model rows.
- Initial public states are:
  - `never_scanned`: no settled scan outcome exists;
  - `scanning`: a scan attempt has been atomically claimed and is in progress;
  - `available`: the latest successful scan produced one or more models;
  - `empty`: the latest successful scan produced no models;
  - `failed`: the latest attempt settled unsuccessfully or an interrupted
    attempt was deterministically settled as failed.
- A future freshness policy may add `stale` without changing model identity.
- Failed scans retain safe connection-scoped diagnostics but remove stale
  selectable model rows, preserving the existing fail-closed contract.

### Scan Trigger Coordination

- Every scan trigger routes through one focused, atomic per-connection scan
  coordinator.
- The coordinator deduplicates overlapping work for each connection, isolates
  failures between connections, and publishes the authoritative state
  projection.
- Startup reconciliation performs one bounded attempt for each eligible active
  connection.
- Saving a connection triggers a connection-scoped scan when its endpoint,
  provider kind, credential version, or active status materially changes.
- Re-enabling an inactive connection triggers a scan.
- Label-only edits do not trigger a scan.
- A per-connection retry explicitly forces a new attempt after any settled
  state, including `failed` or `empty`.
- Manual Scan Models explicitly forces one new attempt for every active
  scannable connection.
- Concurrent startup, save, individual retry, and Scan Models requests for the
  same connection must not result in overlapping provider I/O.
- One failed provider does not hide other providers, block their scans, or make
  the Models page unavailable.

### Models UX

- Available Models retains its flat selectable model list with immutable
  `connectionId + modelId` identity.
- Available Models adds an adjacent active-connections panel containing one row
  for every active connection.
- Each active-connection row shows the connection label, provider kind,
  server-projected scan state, safe diagnostic or recovery guidance when
  applicable, and a per-connection retry action.
- Connections in `never_scanned`, `empty`, or `failed` remain visible in the
  active-connections panel even though they have no selectable model row.
- Provider Connections displays the same server-projected scan state as a badge
  and does not independently infer state from model-row presence.
- Manual Scan Models remains the all-connections retry and refresh action.

### Routing Safety

- Dispatch remains blocked when an unavailable connection/model is Global
  Default.
- Non-global route repair follows routing-policy rules.
- Reconciliation and UI projection do not alter existing connection or model
  identities.
- Existing disabled and deleted connection behavior remains unchanged.

## Acceptance Criteria

- A dedicated durable reconciliation ledger stores one machine-owned record per
  connection with reconciliation version, scan state, trigger, attempt
  boundaries, and settled outcome.
- On first startup after this migration, every active connection with neither
  catalog evidence nor diagnostic evidence for the applicable reconciliation
  version receives exactly one bounded reconciliation attempt.
- The coordinator atomically claims each eligible connection before provider
  I/O and prevents overlapping scans of that connection across startup, save,
  individual retry, and Scan Models triggers.
- An interrupted claimed attempt is deterministically settled without repeated
  automatic provider contact on subsequent startups.
- A migrated fixture containing active OpenAI and DeepSeek Pi Session
  connections, but catalog rows only for OpenAI, discovers and persists the
  DeepSeek catalog without changing OpenAI connection or model identities.
- A reconciliation failure records one safe connection-scoped diagnostic,
  clears only that connection's stale models, settles its ledger outcome, and
  does not prevent other active connections from being read or scanned.
- Restarting after a recorded successful, empty, failed, or deterministically
  settled interrupted attempt does not repeatedly contact that provider for
  the same reconciliation version.
- Provider Connections exposes every active connection with the authoritative
  server-projected state badge.
- Available Models contains an adjacent active-connections panel with one state
  row and retry action per active connection, including connections in
  `never_scanned`, `empty`, and `failed` states with no model rows.
- The flat selectable model list remains unchanged in structure and continues
  to use immutable `connectionId + modelId` identity while showing the
  operator's connection label.
- Saving a changed endpoint, provider kind, credential version, or active
  re-enable triggers a connection-scoped scan.
- A label-only edit does not trigger provider I/O.
- Individual retry forces a new attempt for the selected active scannable
  connection.
- Manual Scan Models forces one new attempt for every active scannable
  connection, isolates failures, and refreshes all projected states.
- A zero-model successful response settles as `empty`, removes stale selectable
  rows for that connection, and remains visible through its connection-state
  row.
- Existing secret isolation, redirect rejection, stale-catalog removal,
  disabled/deleted connection behavior, and Global Default safety remain
  unchanged.
- Unit and integration tests cover versioned reconciliation, atomic claiming,
  crash-safe interrupted-attempt settlement, idempotent restart, trigger
  deduplication, mixed provider success/failure, zero-model success,
  material-versus-label-only edits, forced retries, and no-secret behavior.
- Gherkin and Playwright coverage proves the two-active-provider migration and
  visible `never_scanned`, `empty`, and `failed` recovery states through the
  public Models UI.
- Gherkin and Playwright coverage proves that an individual retry and Scan
  Models update the same server-projected state shown by Available Models and
  Provider Connections.

## Hepha Deep-Dive Decisions

| Topic | Decision | Consequence |
|---|---|---|
| Durable reconciliation authority | Per-connection reconciliation ledger | A dedicated machine-owned record stores reconciliation version, state, trigger, attempt boundaries, and settled outcome. Claims occur atomically before provider I/O, and interrupted attempts settle deterministically without repeated startup contact. |
| Zero-model connection UX | Dedicated connection-state panel | Available Models keeps its flat selectable model list and adds an adjacent active-connections panel with one state row and retry action per connection. Provider Connections shows the same server-projected state as a badge. |
| Scan trigger coordination | Atomic per-connection scan coordinator | Every trigger uses one coordinator that deduplicates per connection and isolates failures. Endpoint, provider kind, credential version, and active re-enable changes trigger scans; label-only edits do not. Individual and all-connections manual actions force new attempts. |

## Dependencies

- FEAT-058 — provider connection records and secret-safe lifecycle.
- FEAT-059 — provider scanners, normalized catalog, diagnostics, and
  `scanAllActiveConnections()`.
- FEAT-060 — Models destination and recovery presentation.
- FEAT-062 — existing installation migration and launch validation context.

## Scope And Boundaries

### In Scope

- durable per-connection reconciliation ledger and schema migration;
- reconciliation version, trigger, attempt-boundary, state, and settled-outcome
  persistence;
- crash-safe startup eligibility, atomic claim, and deterministic interrupted
  attempt settlement;
- connection-level server-projected scan state;
- one atomic per-connection coordinator shared by every scan trigger;
- bounded migration of existing active unscanned connections;
- material-change detection for endpoint, provider kind, credential version,
  and active re-enable;
- label-only edit exclusion;
- Available Models active-connections panel and per-connection retry;
- Provider Connections scan-state badges;
- all-connections Scan Models behavior;
- startup, API, integration, Gherkin, and browser acceptance evidence.

### Out of Scope

- periodic background scanning or arbitrary freshness intervals;
- implementation of a `stale` freshness state;
- provider billing/account administration;
- route-matrix completion, owned by FEAT-070;
- model choice or automatic benchmark/cost selection;
- new non-Pi/non-OpenAI-compatible discovery protocols;
- changes to immutable model identity;
- automatic recurring retries after settled failures.

## Refinement And Implementation Planning

Refinement must define:

- the reconciliation-ledger schema, constraints, migration version, and
  relationship to provider connections;
- the transaction boundary for atomic scan claims and final settlement;
- the deterministic rule and diagnostic used to settle interrupted attempts;
- how the coordinator identifies and returns an already-running attempt without
  starting duplicate provider I/O;
- how reconciliation version changes make qualifying connections eligible for
  a new bounded startup attempt;
- the canonical server projection that maps ledger, catalog, diagnostic, and
  connection lifecycle data to the five public scan states;
- material-change detection for endpoint, provider kind, credential version,
  and active re-enable;
- forced-attempt semantics for individual retry and Scan Models;
- API response shapes for active connection state, safe diagnostics, retry
  actions, and in-progress deduplication;
- UI behavior while a connection is `scanning` and when concurrent requests
  resolve to an existing attempt.

These implementation choices must preserve the accepted product rules:
settled outcomes do not retry on every restart, all triggers use the same
per-connection coordinator, and scan state is projected by the server rather
than inferred independently by each UI.

## Validation

- Validate against a copied SQLite fixture with the observed OpenAI-cataloged
  and DeepSeek-unscanned state.
- Validate crash recovery after an atomic claim but before provider I/O, during
  provider I/O, and before outcome settlement.
- Validate that each interrupted case settles deterministically and does not
  repeatedly contact the provider on restart.
- Validate concurrent startup, save, individual retry, and Scan Models requests
  against the same connection to prove provider I/O is deduplicated.
- Validate mixed-provider execution where one connection succeeds, one is
  empty, and one fails.
- Validate that material connection changes trigger scans while label-only
  changes do not.
- Validate that individual retry and Scan Models force new attempts without
  permitting overlapping work for the same connection.
- Validate that the active-connections panel and Provider Connections badges
  display the same server-projected state.
- Validate that ledger records, diagnostics, API responses, logs, and UI content
  contain no credentials or secret-bearing provider data.
- Trace EPIC scenarios E011-PROV-006 and E011-PROV-007 into focused backend
  Gherkin and Models Playwright coverage.
