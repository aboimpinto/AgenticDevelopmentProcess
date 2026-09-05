# FEAT-027: Path Policy And Workspace Boundaries

**Feature ID**: FEAT-027  
**Parent Epic**: EPIC-006  
**Status**: Completed

## Summary

Define portable read/write path allowlists by tool profile. Validate project root, MemoryBank, worktree, and sibling-project boundaries before worker execution. Block disallowed write boundaries through a pure path-policy evaluator and worker-launch gate before any worker or tool can modify files. Surface blocked path attempts in workflow history and execution receipts. Support project-specific path rules through portable path tokens resolved from project configuration at runtime, without hardcoding machine-specific absolute paths.

Dependency: Tool Profile Model And Selection.

## Source

- EPIC: EPIC-006 - Safety Tool Profiles And Approval Gates
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance Criteria | FEAT-027 owns the end-to-end enforcement contract for path policies and workspace boundaries. |
| Validation | Proceed after the Tool Profile Model dependency is confirmed, with an audit-first scope. |
| Portable path policy schema | Use project-relative tokens such as `projectRoot`, `memoryBank`, `worktrees`, and `approvedSiblings`, resolved at runtime from project configuration. |
| Enforcement boundary | Implement a pure path-policy evaluator plus worker-launch gate. Block worker launch when declared workflow/write boundaries violate the selected tool profile. |
| Audit and evidence scope | Inventory current project root, MemoryBank, worktree, sibling, worker-launch, receipt, and history paths, then implement only confirmed enforcement gaps. |

## Acceptance Criteria

- Define a path policy schema that supports read and write allowlists by tool profile.
- Represent project-specific path rules using portable tokens, including:
  - `projectRoot`
  - `memoryBank`
  - `worktrees`
  - `approvedSiblings`
- Resolve portable tokens at runtime from explicit project configuration.
- Validate project root, MemoryBank, worktree, and sibling-project boundaries before worker execution.
- Provide a pure path-policy evaluator that can be tested independently from worker execution.
- Add a worker-launch gate that blocks launch when declared workflow or write boundaries violate the selected tool profile.
- Block disallowed write attempts before any worker or tool execution can modify files.
- Record blocked path attempts in workflow history and execution receipts.
- Support project-specific path rules without hardcoding machine-specific absolute paths.
- Confirm that the Tool Profile Model And Selection dependency exists before refinement or implementation.
- Audit existing path resolution and boundary enforcement behavior before adding new enforcement logic.
- Implement only verified gaps found during the audit.

## Scope

FEAT-027 covers the policy and enforcement layer for file-system boundaries used by Hepha-managed worker execution.

The feature should ensure that path permissions are derived from explicit project and tool-profile configuration, not from implicit assumptions about the current machine, drive letter, checkout location, shell, or repository location.

Covered boundaries include:

- Active project root.
- MemoryBank location.
- Worktree locations.
- Approved sibling-project locations.
- Tool-profile-specific read boundaries.
- Tool-profile-specific write boundaries.
- Worker-launch path declarations.
- Workflow history records.
- Execution receipts.

## Path Policy Model

The path policy model should be portable and project-configured.

Policies must use symbolic path roots rather than absolute local paths. Supported initial tokens are:

| Token | Meaning |
| --- | --- |
| `projectRoot` | The active project repository root resolved from project configuration. |
| `memoryBank` | The configured MemoryBank location for the active project. |
| `worktrees` | Approved worktree roots for the active project. |
| `approvedSiblings` | Explicitly configured sibling project roots that the workflow may read or write according to the selected profile. |

A tool profile may define separate read and write allowlists. The evaluator should resolve each token to canonical runtime paths before comparing requested paths against the active policy.

The schema must allow project-specific configuration while avoiding values that only work on one machine, such as hardcoded drive letters or user-specific absolute checkout paths.

## Enforcement Approach

FEAT-027 should introduce or complete enforcement using two layers:

1. **Pure path-policy evaluator**
   - Accepts a resolved project configuration, selected tool profile, requested read/write boundaries, and candidate path.
   - Returns an allow/block decision with enough structured reason data for receipts and history.
   - Is deterministic and independently testable.

2. **Worker-launch gate**
   - Runs before worker execution.
   - Validates declared workflow and write boundaries against the selected tool profile.
   - Blocks launch when a declared write boundary is outside the approved policy.
   - Ensures no worker or tool execution starts when the path policy has already failed.

Blocked attempts must be visible in both workflow history and execution receipts.

## Audit Requirements

Implementation must begin with an audit of current behavior. The audit should inventory how Hepha currently resolves, stores, and uses:

- Project root paths.
- MemoryBank paths.
- Worktree paths.
- Sibling project paths.
- Worker-launch path declarations.
- Tool profile selection.
- Receipt path data.
- Workflow history path data.
- Any existing path normalization or boundary checks.

The implementation should then address only confirmed gaps found during this audit.

## Out Of Scope

- Replacing the Tool Profile Model And Selection dependency.
- Hardcoding local absolute paths such as machine-specific Windows drive letters.
- Broad redesign of workflow execution unrelated to path policy enforcement.
- Implementing speculative boundary rules that are not supported by the audit.
- Runtime MCP-based path enforcement.
- Changing MemoryBank layout or project discovery semantics except where needed to resolve configured path tokens.

## Validation

Refinement confirmed that the Tool Profile Model And Selection dependency is available and provides enough structure to associate path rules with tool profiles.

Implementation must begin with an audit of current path resolution, workspace boundary handling, MemoryBank path handling, worktree handling, sibling-project access, worker-launch checks, history records, and execution receipts. Implementation should then target only verified enforcement gaps found during that audit.
