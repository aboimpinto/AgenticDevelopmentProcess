# Review Governance Dashboard And Controlled Rollout

## Purpose And Authority Boundary

This guide is for the local Hepha operator and architecture steward operating the FEAT-068 governance dashboard. It describes a **single-operator, loopback-only** surface for reading review/remediation and architecture-debt governance, recording explicitly confirmed actions, validating dashboard parity in shadow mode, and operating one bounded pilot.

The dashboard is not an authority source. SQLite rollout state and the FEAT-065/066/067 provider decisions are authoritative. Markdown, browser state, queue position, fingerprints, filenames, and retry counts are browseable evidence only.

Do not expose this interface through a remote proxy, token, forwarded-header trust rule, or shared-user workflow. Remote/RBAC operation is outside this V1 contract. The dashboard cannot select a pilot, broaden a pilot, or create an autonomous authority loop.

## Dashboard And API Boundary

The dashboard reads `GET /api/projects/:projectId/governance/dashboard` and submits confirmed actions only to `POST /api/projects/:projectId/governance/actions`. The supporting safe read routes are:

- `GET /api/projects/:projectId/governance/replans/:aggregateId?...`
- `GET /api/projects/:projectId/governance/architecture-debt/:recordId`
- `GET /api/projects/:projectId/governance/rollout-status`

The route project ID is resolved from the registered project; query and body fields never override it. Reads expose only allowlisted V1 summaries, IDs, state/version information, safe metrics, and safe rollout status. They do not expose raw artifacts, raw SQLite rows, database paths, environment/configuration values, credentials, tokens, unvalidated Markdown, or absolute paths.

A read refusal is an operational stop, not an empty result. In particular, `GOVERNANCE_STATE_CONFLICT`, `GOVERNANCE_STORE_UNAVAILABLE`, and `UNSAFE_GOVERNANCE_PROJECTION` require investigation before governance work continues. A valid project with no governance records is explicitly displayed as an empty state.

## Recording A Governance Action

1. Work from the applicable queue item or detail view and confirm its target and displayed version.
2. Enter a specific operator reason and select the deliberate confirmation checkbox.
3. Submit the action. The client sends the V1 request with the required confirmation statement and digest; it does not submit actor, role, trusted time, authority, or enforcement state.
4. Treat the server receipt plus refreshed dashboard read as the result. Do not infer success from a closed dialog or changed browser state.
5. On `STALE_VERSION`, `FOREIGN_TARGET`, `ACTION_NOT_AVAILABLE`, `PROVIDER_REFUSED`, or a persistence refusal, make no retry based on cached UI state. Refresh, reassess the provider-owned state, and obtain any required human decision again.

The server accepts mutations only from the actual loopback socket (`127.0.0.1`, `::1`, or normalized `::ffff:127.0.0.1`), resolves the configured local identity itself, rereads current state, delegates to the owning provider, and verifies persistence/read-back. A confirmation digest records deliberate intent; it is not authorization and cannot bypass local identity, version checks, provider policy, or persistence.

## Shadow Validation And Migration Audit

Shadow validation compares the authoritative safe projection with the same V1 dashboard model. A matching receipt is evidence only: it does not enable enforcement. The rollout status remains `DISABLED` until every pilot-admission predicate is separately satisfied.

Before considering a pilot, the operator must verify through the safe rollout status that:

- parity is `MATCH` for the same project and current source version, and has not expired;
- the governance-rollout migration audit is successful and read-back verified; and
- no status route or persistence refusal has occurred.

Do not manufacture, edit, or substitute a parity receipt, migration-audit ID, source hash, or read-back hash. A mismatch, stale receipt, unreadable audit, migration failure, or foreign evidence denies admission. Shadow/migration operations preserve pilot events; they never activate enforcement.

## Pilot Admission And Human Responsibilities

A pilot is a pre-approved server configuration, not a dashboard-created selection. It must be exactly one configured low-risk `REVIEW_RECOVERY` boundary with matching project, feature, phase contract, task, contract version, and configuration hash.

Only the configured local architecture steward may approve admission or disablement. The steward must provide a meaningful reason, deliberately confirm the action, and choose an expiry later than approval but no more than 24 hours later. Admission additionally requires current matching parity, a successful migration audit, the exact disabled state/version, and a valid loopback request.

Admission does **not** dispatch work. The dispatch gate permits only the exact persisted pilot candidate. A different project, feature, scope, version, source vector, configuration, duplicate admission, missing authority, or recurrence stop must not dispatch work. Do not use a queue item, legacy fingerprint, retry count, Markdown report, caller-supplied identity, or browser payload to authorize a pilot.

## Monitoring, Disablement, And Rollback

Monitor the rollout status and safe audit outcomes while a pilot is active. Immediately disable the pilot when there is a suspected incident, expiry, parity/source drift, governance storage failure, recurrence stop, or uncertainty about authority or scope.

1. Use **Disable active pilot** in the Governance view.
2. Enter the incident/rollback reason and deliberately confirm the disablement.
3. Verify the server-refreshed state is `NEEDS_HUMAN` and that autonomous dispatch is stopped.
4. Preserve audit and migration evidence for diagnosis; do not delete or rewrite it.
5. Diagnose through safe provider/rollout evidence, then obtain a new explicit human decision for any later work. V1 cannot reactivate a `NEEDS_HUMAN` pilot.

Restart does not restore a pilot from browser state. The rollout aggregate is reconstructed from append-only events. Disablement, expiry, parity invalidation, recurrence stop, and governance-storage failure fail closed to `NEEDS_HUMAN`; rollback never restores Markdown, filename, fingerprint, progressive-retry, caller-authority, or remote authority as an automatic fallback.

## Executable Contract Traceability

The following existing public tests are the executable evidence for this guide. The phase validation task records current command results separately; this table intentionally does not claim a test run.

| Scenario | Public evidence |
| --- | --- |
| E013-GD-001 | `apps/orchestrator/test/feat-068-governance-read-api.test.ts` — `E013-GD-001 returns only an allowlisted, deterministic dashboard through the public GET route`; `E013-GD-001 refuses malformed selectors, unknown projects, and foreign replan detail`; `apps/web/e2e/feat-068-governance-dashboard.spec.ts` — `lists safe governance state and confirms a replan action with focus restoration` |
| E013-GD-002 | `apps/orchestrator/test/feat-068-governance-read-api.test.ts` — `E013-GD-002 returns only an allowlisted architecture-debt record through public list and detail routes`; `E013-GD-002 fails closed for unsafe provider data and an unavailable store rather than treating either as empty`; dashboard Playwright list/detail scenario above |
| E013-GD-003 | `apps/orchestrator/test/feat-068-governance-action-api.test.ts` — `E013-GD-003 records a confirmed current debt-triage action through the public POST route`; `E013-GD-003 records confirmed scope-expansion and replan decisions through their real provider boundaries`; dashboard Playwright confirmation scenario above |
| E013-GD-004 | `apps/orchestrator/test/feat-068-governance-action-api.test.ts` — `E013-GD-004 refuses non-loopback before reading a body or mutating a provider`; `E013-GD-004 refuses malformed, unconfirmed, caller-authority, stale, foreign, provider-refused, and persistence-failed requests without mutation`; `apps/web/e2e/feat-068-governance-dashboard.spec.ts` — `retains the current governance view and exposes a stale refusal` |
| E013-GD-005 | `apps/web/src/governance/governance-dashboard.test.tsx` — `requires keyboard-operable confirmation and refreshes only from the server receipt`; `preserves the prior model and exposes a stale refusal with an explicit refresh`; `renders explicit valid-empty governance states rather than treating a safe empty read as unavailable`; dashboard Playwright scenarios |
| E013-GD-006 | `apps/orchestrator/test/feat-068-shadow-parity.test.ts` — `E013-GD-006 canonicalizes reordered equivalent V1 projections and records a safe MATCH without enforcement mutation`; `E013-GD-006 persists only safe mismatch categories and refuses unsafe or foreign models`; `apps/web/e2e/feat-068-shadow-rollout.spec.ts` — `presents a disabled browser-visible shadow rollout status without enforcement controls` |
| E013-GD-007 | `apps/orchestrator/test/feat-068-shadow-parity.test.ts` — `E013-GD-007 fails closed for a parity write/read-back failure and leaves enforcement data byte-for-byte unchanged`; `E013-GD-007 applies, reopens, read-backs, and exposes a public disabled rollout status`; shadow-rollout disabled-status scenario |
| E013-GD-008 | `apps/orchestrator/test/feat-068-enforcement-pilot.test.ts` — `E013-GD-008 admits only one exact current low-risk pilot and permits only its exact dispatch candidate`; `E013-GD-008 rejects malformed or foreign dispatch candidates before routing and preserves exact active-pilot controls`; `apps/web/e2e/feat-068-shadow-rollout.spec.ts` — `shows the bounded active-pilot status and only an explicit disable control` |
| E013-GD-009 | `apps/orchestrator/test/feat-068-enforcement-pilot.test.ts` — `admits and disables the exact pilot through the real loopback POST boundary`; `E013-GD-009 persists disablement across restart and returns needs-human for expiry or operator disablement`; active-pilot rollout Playwright scenario |
