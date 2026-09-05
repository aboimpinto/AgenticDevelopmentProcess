# FEAT-028: Command Policy Gateway

**Feature ID**: FEAT-028
**Parent Epic**: EPIC-006
**Status**: Completed

## Summary

Implement an orchestrator command policy gateway as the first enforceable safety decision point for Hepha-managed worker command execution.

The gateway classifies commands before worker launch as `allowed`, `approval_required`, or `blocked`. It applies only to orchestrator-managed worker commands in this feature; direct Pi internal tool-call enforcement is deferred.

The policy must be schema-backed and portable through a dedicated `.hepha/safety/command-policy.yaml` file. It must reference tool profiles from FEAT-026, respect path boundaries from FEAT-027, use symbolic project tokens instead of machine-specific absolute paths, block dangerous normalized shell patterns by default, allow project-specific verification commands through explicit policy, classify unmatched commands as `approval_required`, and record every decision in workflow history and run receipts before command execution or blocking.

Until approval UX exists, `approval_required` commands are recorded and stopped before execution.

Dependencies: FEAT-026 Tool Profile Model And Selection; FEAT-027 Path Boundary Model.

## Source

- EPIC: EPIC-006 - Safety Tool Profiles And Approval Gates
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision | Detail |
| --- | --- | --- |
| Acceptance criteria boundary | Command-only enforceable gateway | Implement schema-backed command policy, pure command classification, default dangerous-pattern blocking, allowed verification commands, approval-required decisions, and additive history/receipt recording before worker execution. |
| Validation | Confirm as command-gateway slice | Proceed with FEAT-028 as the command-policy layer that builds on FEAT-026 profiles and FEAT-027 path boundaries while deferring approval UX and git guardrails. |
| Policy source and portability | Separate safety policy file | Create a dedicated `.hepha/safety/command-policy.yaml` with schema validation, profile references, and symbolic project tokens so command policy remains independent, portable, and aligned with FEAT-026/027. |
| Approval-required handling | Record and stop before execution | Write the approval-required decision to history and receipt, then do not execute the command. Approval UX remains deferred. |
| Classifier design | Pure normalized evaluator | Parse and normalize command input, apply default dangerous-pattern blocking and explicit allow/approval rules in a pure function with focused tests. |
| Enforcement boundary | Orchestrator-managed worker commands only | Enforce the gateway on Hepha workflow command execution paths before worker launch. Direct Pi internal tool-call enforcement is out of scope for this FEAT. |
| Classification precedence | Non-overridable danger block, explicit allow, unmatched approval-required | Dangerous normalized patterns always block. Explicit verification rules allow safe commands. Unknown commands are recorded and stopped as `approval_required` for future approval UX. |
| Audit and type contract | Additive optional structured fields with redacted summaries | Extend shared receipt/history contracts compatibly. Store normalized redacted command summaries, rule IDs, profile/path context, outcome, timestamp, and execution status without exposing secrets. |

## Scope

FEAT-028 covers the command-policy layer for Hepha orchestrator-managed worker commands only.

In scope:

- Define a schema-backed command policy model.
- Create a dedicated `.hepha/safety/command-policy.yaml` policy source.
- Validate command policy against an explicit schema.
- Use symbolic project tokens in policy definitions instead of machine-specific absolute paths.
- Reference FEAT-026 tool profiles from command policy rules.
- Respect FEAT-027 path boundaries during command classification.
- Classify orchestrator-managed worker commands before worker launch.
- Support policy outcomes:
  - `allowed`
  - `approval_required`
  - `blocked`
- Apply deterministic classification precedence:
  - non-overridable dangerous-pattern blocking;
  - explicit allow rules for safe verification commands;
  - explicit approval-required rules for known sensitive commands;
  - unmatched commands default to `approval_required`.
- Block dangerous normalized shell patterns by default.
- Allow project-specific verification commands through explicit policy.
- Represent unmatched or approval-required decisions as stop-before-execution outcomes until approval UX exists.
- Record command policy decisions additively in workflow history.
- Attach command policy decisions to run receipts before worker execution or blocking.
- Extend receipt and history contracts with optional structured command-policy fields.
- Store redacted normalized command summaries rather than raw secret-bearing command text.
- Implement classification as a pure normalized evaluator with focused tests.

Out of scope:

- Direct Pi internal tool-call enforcement.
- Approval UX for reviewing or approving commands.
- Executing commands classified as `approval_required`.
- Git-specific guardrails.
- Runtime worker implementation beyond enforcing the pre-execution policy decision.
- Broad tool authorization outside command classification.
- Manual override flows, approval persistence, or approval screens.

## Policy Model

The command policy must live at `.hepha/safety/command-policy.yaml`.

The policy file must be portable across machines and repositories by using symbolic project tokens and profile references rather than hardcoded local absolute paths.

The policy model must support:

- schema versioning;
- project or workspace identity;
- references to FEAT-026 tool profiles;
- references to FEAT-027 path boundary concepts;
- default dangerous-pattern blocking rules;
- explicit allow rules for verification commands;
- explicit approval-required rules;
- unmatched-command fallback to `approval_required`;
- clear rule identifiers for receipt and history traceability;
- deterministic classification outcomes.

Example policy concepts:

| Concept | Purpose |
| --- | --- |
| Schema version | Allows safe evolution of the policy format. |
| Profile reference | Connects command permissions to FEAT-026 tool profiles. |
| Symbolic project token | Keeps paths portable across machines. |
| Path boundary reference | Applies FEAT-027 project/workspace path limits during command evaluation. |
| Default block rule | Blocks dangerous normalized shell patterns even when an explicit allow rule would otherwise match. |
| Allow rule | Permits known verification commands such as lint, test, typecheck, or build checks. |
| Approval rule | Records commands that require future approval UX and stops execution for now. |
| Unmatched fallback | Treats unknown commands as `approval_required`, not executable by default. |
| Rule ID | Provides audit traceability in workflow history and receipts. |

## Command Classification

Command classification must happen before orchestrator-managed worker command execution.

The classifier must:

1. Parse the raw command request.
2. Normalize command input into a deterministic representation.
3. Redact or summarize sensitive command content for audit fields.
4. Evaluate path-boundary context from FEAT-027.
5. Evaluate referenced tool profile context from FEAT-026.
6. Apply non-overridable dangerous-pattern blocking rules.
7. Evaluate explicit allow rules for safe verification commands.
8. Evaluate explicit approval-required rules for known sensitive commands.
9. Classify unmatched commands as `approval_required`.
10. Return a policy decision without side effects.
11. Let the orchestrator record the decision and enforce the result.

Supported outcomes:

| Outcome | Execution behavior | Recording behavior |
| --- | --- | --- |
| `allowed` | Command may proceed to worker execution. | Record decision before execution and attach to run receipt. |
| `approval_required` | Command must not execute in this FEAT. | Record decision and stop before execution. |
| `blocked` | Command must not execute. | Record decision and block execution. |

The evaluator should be a pure function so policy behavior can be tested without running commands or mutating workflow state.

## Classification Precedence

Classification must be deterministic and conservative.

Precedence:

1. **Dangerous normalized pattern**: always returns `blocked`. This cannot be overridden by explicit allow rules.
2. **Path-boundary violation**: returns `blocked` when the command attempts to write outside allowed symbolic project boundaries or bypass configured path controls.
3. **Explicit allow rule**: returns `allowed` only for known safe verification commands that match the active profile and path context.
4. **Explicit approval-required rule**: returns `approval_required` for known sensitive commands that are not dangerous enough to block permanently but require future approval UX.
5. **Unmatched command**: returns `approval_required`.

This means the gateway is not a broad command allowlist for all shell activity. Only explicitly allowed safe verification commands may execute. Unknown commands are auditable non-executed decisions.

## Default Dangerous-Pattern Blocking

Dangerous shell patterns must be blocked by default unless a later FEAT explicitly introduces a safer approved mechanism.

The default block list should cover high-risk command patterns such as:

- destructive recursive deletion;
- privilege escalation;
- credential or secret exfiltration patterns;
- shell piping into interpreters from remote URLs;
- writes outside allowed project boundaries;
- commands that bypass configured path boundaries;
- unsafe shell redirection or mutation outside symbolic project roots;
- other clearly unsafe shell constructs identified by the policy schema.

The implementation should avoid brittle raw substring matching where possible. Commands should be parsed or normalized first, then evaluated against structured rules.

Dangerous-pattern blocking is non-overridable in FEAT-028. An explicit allow rule must never permit a command that matches a dangerous normalized pattern.

## Approval-Required Handling

Until approval UX exists, `approval_required` is a terminal pre-execution result.

A command is classified as `approval_required` when:

- it matches an explicit approval-required policy rule; or
- it does not match a dangerous block rule, path-boundary block, or explicit allow rule.

When a command is classified as `approval_required`, the orchestrator must:

1. record the approval-required policy decision in workflow history;
2. attach the decision to the relevant run receipt;
3. stop before worker execution;
4. return a clear non-executed result to the workflow layer.

This FEAT must not implement approval prompts, approval screens, approval persistence, manual override flows, or execution after approval.

## Workflow History And Run Receipts

Every policy decision must be auditable.

Receipt and history data must be added through compatible optional structured fields so existing consumers continue to work.

For each classified command, record enough information to support later review without exposing secrets:

- normalized redacted command summary;
- policy outcome;
- matching rule ID or default rule ID;
- referenced tool profile, when applicable;
- relevant symbolic project/path context;
- timestamp;
- worker or run identifier;
- whether execution proceeded or was stopped;
- safe reason text suitable for receipts and history views.

Policy decisions must be written before command execution for `allowed` commands and before stopping for `approval_required` or `blocked` commands.

Raw command text that could include secrets should not be stored directly in history or receipts. Store a normalized redacted summary and structured context instead.

## Acceptance Criteria

- A schema-backed command policy definition exists for classifying worker commands.
- The command policy is stored in `.hepha/safety/command-policy.yaml`.
- The policy file supports schema validation.
- The policy file uses symbolic project tokens instead of machine-specific absolute paths.
- The policy model can reference FEAT-026 tool profiles.
- The command policy respects FEAT-027 path boundaries.
- The orchestrator evaluates command policy before launching orchestrator-managed worker commands.
- Direct Pi internal tool-call enforcement is not implemented in this FEAT.
- Commands are classified into `allowed`, `approval_required`, or `blocked`.
- Dangerous normalized shell patterns are blocked by default.
- Dangerous-pattern blocking is non-overridable by explicit allow rules.
- Path-boundary violations are blocked.
- Project-specific verification commands can be explicitly allowed through policy.
- Known sensitive commands can be explicitly classified as `approval_required`.
- Unmatched commands are classified as `approval_required`.
- Approval-required command decisions are represented as policy outcomes.
- Approval-required commands are recorded and stopped before execution.
- Blocked commands do not execute.
- Allowed commands can proceed to worker execution.
- Each policy decision is recorded in workflow history before execution or blocking.
- Each policy decision is attached to the relevant run receipt.
- Receipt and history contracts are extended using additive optional structured fields.
- Stored command summaries are normalized and redacted to avoid exposing secrets.
- Command classification is implemented as a pure normalized evaluator.
- Focused tests cover normalization, redaction, precedence, default blocking, path-boundary blocking, explicit allow rules, approval-required rules, unmatched-command approval fallback, and blocked-command enforcement.
- The implementation builds on FEAT-026 tool profiles and FEAT-027 path boundaries.
- Approval UX and git guardrails remain deferred to later FEATs.

## Validation

FEAT-028 is confirmed as the command-policy gateway slice for EPIC-006. It should proceed to refinement as the enforceable command-classification layer for orchestrator-managed worker command execution, with direct Pi internal tool-call enforcement, approval UX, and git guardrails intentionally deferred.
