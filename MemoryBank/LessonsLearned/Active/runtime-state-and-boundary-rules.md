# Runtime State And Boundary Rules

These active rules constrain future design, refinement, implementation, review,
and completion work that crosses persisted state, concurrency, transport, or UI
boundaries. Related cross-field validation and transport migration rules are
merged into `code-quality-assumptions.md`; per-method controls are merged into
`single-responsibility-production-modules.md`.

### Rule: Make Cross-Store Recovery Replay-Safe By Identity

- Applies to: deep-dive, refine-feature, persistence, recovery, code-review
- Trigger: one logical attempt mutates more than one durable authority or can
  restart between an external side effect and settlement.
- Instead of: proving only the local transaction or writing an unkeyed recovery
  diagnostic that duplicates on replay.
- Do: enumerate every crash window, bind recovery outcomes to the attempt
  identity, accept an exact replay as a no-op, reject identity collisions, and
  avoid repeating provider or other external I/O after durable evidence exists.
  Reconstruct authority from durable task/state/review artifacts before retry;
  retain the exact sanitized error class/message and authority mismatch.
- Verify: reopen storage and replay crashes before external I/O, during I/O,
  after each durable mutation, and before settlement; assert final state,
  diagnostics, external call counts, and that completed work is not replayed.
- Source: FEAT-069 Lessons Learned §2, "Cross-store crash recovery must be
  replay-safe by identity"; FEAT-070 Lessons Learned §5, "Durable retry state
  outranks a compact failure summary"

### Rule: Validate Each Durable Authority Before Filtering Its Join

- Applies to: persistence, application composition, projectors, deletion flows,
  code-review
- Trigger: a read model joins durable history with the current membership of a
  separately owned aggregate.
- Instead of: filtering history to current members before validation or passing
  all independent history into a projector scoped to current members.
- Do: validate each authority's complete result first, then filter the already
  valid records and diagnostics at the explicit membership join before
  projection.
- Verify: exercise creation, durable history, hard deletion, reopen, and public
  read/projection through the real route; prove valid orphan history neither
  corrupts the authority nor enters the current aggregate projection.
- Source: FEAT-069 Lessons Learned §3, "Validate independent authorities before
  filtering their join"

### Rule: Separate Sparse Durable State From Complete Projection

- Applies to: deep-dive, refinement, persistence, projectors, API design,
  acceptance tests
- Trigger: sparse durable policy or independently registered entities must form
  a complete operator-facing hierarchy or matrix.
- Instead of: treating row counts, prepared partial fixtures, or one authority's
  validity as proof of the complete projection.
- Do: validate each authority independently, compose the complete hierarchy at
  the server/public boundary, and keep inheritance, eligibility, refusal, and
  effective-state semantics out of the client.
- Verify: use exact positive and negative controls for sparse storage, registry
  membership, no-read-write projection, every required scope/entity, and states
  that must never be projected.
- Source: FEAT-070 Lessons Learned §§1 and 6, "Sparse durable state and complete
  operator projection are separate contracts" and "Cross-phase contracts need
  complete producer-to-consumer closure"

### Rule: Settle Transactional Writes Before Commit

- Applies to: persistence, mutation services, HTTP transport, code-review
- Trigger: a successful write must return a complete authoritative snapshot or
  advance a revision while multiple durable effects share one transaction.
- Instead of: testing only the changed row, or committing and then performing a
  fresh fallible authority read needed to construct success.
- Do: validate the complete candidate policy and graph, derive and guard the
  exact success snapshot inside the transaction, roll back on settlement
  failure, then commit and return the captured result without a post-commit
  authority refresh.
- Verify: for success and every rejection class, compare policy, dependencies,
  guard, attention state, revision sequence, and reopen/read-back state; inject
  settlement failure and prove no durable advance or skipped revision.
- Source: FEAT-070 Lessons Learned §§8 and 10, "Revision safety must cover every
  effect inside the transaction" and "Successful writes include complete
  response settlement"

### Rule: Bind Mutation And Preview Settlement To Producer Identity

- Applies to: API clients, web state, previews, conflict handling,
  accessibility review
- Trigger: asynchronous Save, acknowledgement, reload, or preview responses can
  overlap, return out of order, or settle after local state changes.
- Instead of: accepting any structurally valid snapshot, treating draft
  existence as dirtiness, using one panel-wide busy flag, or allowing generic
  cleanup to overwrite a newer conflict.
- Do: bind mutation success to the exact request, successor revision, route,
  policy, guard, notice identity, and timestamp. Track baseline/current/submitted
  values and one saving scope; sequence previews by scope generation and exact
  producer input; clear only the value that actually settled.
- Verify: cover stale, skipped, foreign, absent, unresolved, mismatched, and
  fallback-identity responses; away-and-back cleanliness; newer same-scope and
  unrelated drafts; one-row saving with global admission; stale preview
  generations; and conflict preservation until explicit reload/compare.
- Source: FEAT-070 Lessons Learned §§12–14, "A structurally valid mutation
  response is not necessarily the response to this request", "Draft existence,
  semantic dirtiness, saving scope, and mutation admission are different
  states", and "Async preview authority requires generation and producer-input
  identity"

### Rule: Synchronize Concurrency Tests At An Authoritative Boundary

- Applies to: deep-dive, refine-feature, implementation, integration tests,
  code-review
- Trigger: a test must prove overlap, deduplication, locking, or an in-flight
  request window.
- Instead of: treating promise creation, sleeps, event-loop turns, or client
  scheduling as evidence that competing work was admitted.
- Do: block controlled I/O and observe both contenders at the authoritative
  claim, accepted route, coordinator, lock, or injected transport boundary
  before releasing the first operation.
- Verify: include a counter or barrier at that public boundary, require the
  expected admissions before release, and assert both responses, side effects,
  and external call counts.
- Source: FEAT-069 Lessons Learned §4, "Concurrency tests must synchronize on a
  public boundary"; FEAT-070 Lessons Learned §11, "Concurrency tests must
  synchronize at mutation admission"

### Rule: Project Asynchronous UI Messages From Authoritative Domain State

- Applies to: design-feature, refine-feature, web implementation,
  accessibility review
- Trigger: an HTTP request can return while the server-owned operation remains
  scanning, queued, partially failed, or otherwise unsettled.
- Instead of: equating callback or request completion with completion of the
  domain operation, or deriving the message from local busy state.
- Do: guard the response and classify messaging from authoritative domain state
  with explicit precedence for overlapping states, preserving safe failure
  guidance when states are mixed.
- Verify: test each authoritative state and mixed-state precedence through the
  public web controller or component, including a response that returns while
  the operation is still active.
- Source: FEAT-069 Lessons Learned §6, "UI messaging must follow authoritative
  domain state"
