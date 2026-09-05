# FEAT-029: Serialized Build And Test Execution

**Feature ID**: FEAT-029  
**Parent Epic**: EPIC-006  
**Status**: Completed

## Summary

Enforce one shared-state build/test command at a time through the EPIC-006 command policy system. Apply project lessons from Cargo serialization to Cargo, pnpm, npm, test, build, lint, format, and similar commands that share cache, lock, build-directory, or package-manager state.

The feature must prevent overlapping shared-state command runs while allowing unrelated safe commands to continue. Conflicting shared-state commands are rejected immediately with clear evidence rather than queued or deferred. Serialization is scoped per project/build root so unrelated projects can continue safely.

The implementation must preserve the existing Cargo-specific serialization behavior and generalize it through the Command Policy Gateway introduced by FEAT-028. Dangerous-command checks remain non-overridable and take precedence before any serialization evaluation.

## Source

- EPIC: EPIC-006 - Safety Tool Profiles And Approval Gates
- Created by Hepha unnamed FEAT discovery from the current EPIC document.
- Dependency: FEAT-028 Command Policy Gateway

## Hepha Deep-Dive Decisions

| Topic | Decision | Implementation Meaning |
| --- | --- | --- |
| Acceptance contract | Guard shared-state build/test commands only | Classify Cargo, pnpm, npm, test, build, lint, format, and similar lock/cache/build commands. Prevent overlapping runs that share state. Allow unrelated safe commands. Record evidence in history and receipts. |
| Shared-state command taxonomy | Built-in defaults plus additive policy rules | Implement deterministic built-in classifiers for Cargo, pnpm, npm, and generic `test`/`build`/`lint`/`format` commands. Allow policy configuration to add project-specific shared-state command patterns. Additive policy rules must not weaken dangerous-command precedence. |
| Active command state | SQLite lease registry plus pure snapshot evaluator | Persist active command leases per project/build root. Pass an active-command snapshot into pure conflict logic. Clean up leases on command completion, failure, or cancellation. Record conflict evidence reliably from the lease snapshot. |
| Conflict handling | Block with evidence | When a new shared-state command conflicts with an active shared-state command, reject the new command immediately. Record the active conflict, project/resource scope, and reason in workflow history and receipts. Do not queue or defer the command in this FEAT. |
| Serialization scope | Project-scoped shared-state lane | Serialize shared-state commands per project/build root. Commands in the same relevant project/build root share one conservative serialization lane. Commands in unrelated project/build roots may continue if they do not share state. |
| Policy integration | Extend command policy gateway | Implement pure serialization classification and conflict evaluation inside the FEAT-028 Command Policy Gateway, after dangerous-command checks. Use additive receipt/history fields. |
| Receipt and history contract | Optional nested serialization fields on existing command policy evidence | Add nullable or optional serialization evidence fields to existing command policy receipt/history records. Include classification, lane/scope, conflict, reason, outcome, and result evidence without breaking existing FEAT-028 consumers. Add backward-compatibility tests. |
| Validation | Proceed with bounded EPIC-006 serialization slice | Build on FEAT-028 command policy gateway. Keep decision logic pure. Preserve non-overridable dangerous-command precedence. Use additive receipt/history fields. Add focused tests. Exclude approval UX and git guardrails. |

## Scope

### In Scope

- Generalize existing Cargo-specific serialization into the Command Policy Gateway.
- Add deterministic built-in shared-state command classifiers for:
  - Cargo commands such as `cargo check`, `cargo test`, `cargo clippy`, `cargo fmt`, and `cargo build`.
  - pnpm commands that install, build, test, lint, format, or otherwise use shared package-manager or build state.
  - npm commands that install, build, test, lint, format, or otherwise use shared package-manager or build state.
  - Generic project commands named or configured as `test`, `build`, `lint`, `format`, or similar when they touch shared caches, build directories, locks, or package-manager state.
- Allow additive project-specific policy configuration for extra shared-state command patterns.
- Ensure additive shared-state policy rules cannot override, weaken, or bypass dangerous-command decisions.
- Determine serialization overlap using a conservative project/build-root scope.
- Persist active shared-state command leases in SQLite per project/build root.
- Evaluate conflicts by passing an active-command lease snapshot into pure serialization decision logic.
- Create active leases for allowed shared-state commands before execution.
- Clean up active leases when commands complete, fail, or are cancelled.
- Prevent concurrent execution when a new shared-state command would overlap with an active command in the same relevant project/build root.
- Reject conflicting shared-state commands immediately with evidence. This FEAT does not introduce queuing, retrying, or deferred execution.
- Allow unrelated safe commands that do not share build, cache, lock, or package-manager state.
- Allow shared-state commands in unrelated project/build roots when the policy can determine that they do not share the same relevant state.
- Preserve dangerous-command precedence: if a command is classified as dangerous by the command policy system, that decision is non-overridable and must not be weakened by serialization rules.
- Run serialization classification and conflict evaluation after dangerous-command checks in the command policy flow.
- Add optional nested serialization evidence fields to existing command policy history and receipt records.
- Record serialization classification, decision reasons, active conflict evidence, command result evidence, and policy outcomes in workflow history and receipts using additive fields.
- Add focused tests for classification, configured additive patterns, conflict blocking, lease cleanup, safe-command allowance, unrelated project/build-root allowance, dangerous-command precedence, and receipt/history evidence compatibility.

### Out Of Scope

- Approval UX.
- Git guardrails.
- New interactive approval flows.
- Command queuing, deferred execution, retries, or automatic rescheduling of blocked commands.
- Broad process orchestration beyond the bounded command serialization policy slice.
- Replacing the Command Policy Gateway rather than extending it.
- Using the SQLite lease registry as the policy decision implementation itself; policy decisions must remain pure and testable from snapshots.

## Acceptance Criteria

- The command policy gateway can classify shared-state build/test commands, including Cargo, pnpm, npm, test, build, lint, format, and similar commands that use shared cache, lock, build, or package-manager state.
- Built-in classifiers are deterministic for Cargo, pnpm, npm, and generic shared-state project commands.
- Project-specific policy configuration can add shared-state command patterns without weakening dangerous-command precedence.
- Serialization scope is evaluated per project/build root.
- Active shared-state command leases are persisted in SQLite per project/build root.
- Serialization conflict decisions are made by pure decision logic using an active-command snapshot, not by querying mutable process state directly inside the evaluator.
- A shared-state command is blocked immediately when another active command would overlap with the same relevant project/build-root shared state.
- A blocked command records the active conflicting command, relevant project/resource scope, and policy reason in workflow history and receipts.
- Allowed shared-state commands create an active lease before command execution.
- Active leases are cleaned up on command completion, failure, or cancellation.
- Safe commands that do not share build, cache, lock, or package-manager state remain allowed while a shared-state command is active.
- Shared-state commands in unrelated project/build roots remain allowed when they do not share the same relevant state.
- Existing Cargo serialization behavior is preserved and represented through the generalized policy path.
- Dangerous-command classification remains non-overridable and takes precedence over serialization decisions.
- Serialization classification and conflict evaluation are implemented inside the FEAT-028 Command Policy Gateway rather than as a separate policy path.
- Serialization decisions are produced through pure decision logic that can be tested without launching real build/test commands.
- Workflow history and receipts include optional nested serialization evidence fields for:
  - command classification,
  - serialization decision,
  - decision reason,
  - active conflicting command when present,
  - relevant project/resource scope or lane,
  - policy outcome,
  - final command result evidence for commands that are allowed to run.
- Existing FEAT-028 receipt/history consumers remain compatible when the optional serialization fields are absent or present.
- Tests cover:
  - Cargo shared-state command classification,
  - pnpm and npm shared-state command classification,
  - generic test/build/lint/format shared-state command classification,
  - additive project-specific shared-state pattern classification,
  - prevention of overlapping shared-state commands in the same project/build root,
  - SQLite lease snapshot conflict evaluation,
  - active lease cleanup after completion, failure, and cancellation,
  - allowance of unrelated safe commands,
  - allowance of non-overlapping shared-state commands in unrelated project/build roots,
  - dangerous-command precedence over serialization and additive policy rules,
  - additive receipt/history evidence fields for both blocked and allowed commands,
  - backward compatibility for existing command policy receipt/history consumers.
- The implementation depends on and extends FEAT-028 Command Policy Gateway rather than creating a separate policy path.

## Validation

This FEAT should proceed as a bounded EPIC-006 serialization slice.

Refinement should enforce the following boundary:

- Build on FEAT-028 Command Policy Gateway.
- Keep command decisions deterministic and testable through pure decision logic.
- Evaluate dangerous-command policy first; dangerous decisions are non-overridable.
- Evaluate serialization classification and active-conflict detection after dangerous-command checks.
- Use built-in deterministic shared-state classifiers for Cargo, pnpm, npm, and generic test/build/lint/format commands.
- Allow additive project-specific shared-state classification rules only when they do not weaken dangerous-command policy.
- Use a conservative project/build-root serialization lane for shared-state commands.
- Use SQLite active-command leases as the authoritative active-command registry.
- Pass lease snapshots into pure conflict evaluation.
- Reject conflicting shared-state commands immediately with evidence.
- Add only optional nested workflow history and receipt fields under existing command policy evidence.
- Preserve backward compatibility for existing FEAT-028 consumers.
- Focus tests on command classification, additive policy rules, serialization conflicts, active lease lifecycle, safe-command allowance, unrelated project/build-root allowance, dangerous precedence, and recorded evidence.
- Do not include approval UX, git guardrails, queuing, retries, or deferred execution in this FEAT.
