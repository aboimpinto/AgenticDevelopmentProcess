# FEAT-024: Context Pack Hashing And Staleness Detection

**Feature ID**: FEAT-024  
**Parent Epic**: EPIC-005  
**Status**: Completed

## Summary

Audit existing context-pack selection and prompt assembly. Add deterministic SHA-256 hashing for selected context files, record a versioned selected-context metadata block in run receipts, and detect stale context before launching Pi for metadata-backed continuation workflows.

Continuation workflows must be blocked when a previous receipt contains selected-context metadata and any previously selected context file is changed or missing. Continuations with unchanged files must pass. Starts and continuations based on old receipts without selected-context metadata remain unblocked by this feature.

## Source

- EPIC: EPIC-005 - Native Harness And Workflow Runner
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance contract | Focus the FEAT on receipt hashing and stale-context gating. |
| Scope confirmation | Proceed under EPIC-005 as bounded native runner hardening. |
| Continuation gate scope | Run stale-context preflight only for metadata-backed continuations where a continuation depends on a previous receipt containing selected-context metadata. Starts and old receipts remain unblocked. |
| Receipt metadata capture point | Capture context pack IDs and exact selected files at the existing context selection and prompt assembly boundary as a selection-boundary manifest, then hash those files through pure helpers. |
| Receipt metadata contract | Add a versioned selected-context receipt section containing selected context pack ID or IDs, normalized project-relative file paths, display paths, and per-file SHA-256 hashes. |
| Stale failure handling | Block before Pi starts, record or return path-aware structured preflight failure data, and avoid unrelated UI expansion. |
| Hashing and path errors | Hash file bytes through a pure helper, store normalized project-relative paths plus display paths, and return path-aware missing or changed errors. |
| Implementation boundary | Audit current context selection and prompt assembly, add focused hashing and stale preflight behavior, and use temp-fixture tests for changed, missing, and unchanged cases. Do not expand unrelated workflow layout or UI behavior. |

## Scope

### In Scope

- Determine where context packs are selected for workflow runs.
- Determine where prompt assembly receives or materializes selected context files.
- Determine whether selected context is already persisted in logs, metadata, or receipts.
- Capture selected context pack IDs and exact selected files at the existing context selection and prompt assembly boundary.
- Build a selection-boundary manifest that can be reused for receipt metadata and hashing.
- Add deterministic SHA-256 hashing for selected context file bytes.
- Record selected context pack IDs in run receipts.
- Record per-file hash metadata in run receipts.
- Add a versioned selected-context metadata block to receipts.
- Store normalized project-relative paths for deterministic comparison.
- Store display paths for clear user-facing errors.
- Add stale-context detection before launching Pi for metadata-backed continuation workflows.
- Block continuation when required context files are changed or missing.
- Allow continuation when selected context files are unchanged.
- Skip stale-context preflight for starts and for continuations that do not have previous selected-context receipt metadata.
- Provide clear, path-aware structured stale-context failures.
- Add tests covering:
  - unchanged context files;
  - changed context files;
  - missing context files.

### Out Of Scope

- Workflow board layout changes.
- UI expansion unrelated to displaying or surfacing stale-context failures.
- New context-pack authoring workflows.
- Runtime MCP dependency changes.
- Broad workflow-state redesign beyond the receipt metadata and stale preflight needed for this feature.
- Blocking starts or continuation workflows that have no previous selected-context metadata.
- Changing context-pack selection semantics beyond capturing the selected files that are already used.

## Receipt Metadata Capture

Selected-context metadata must be captured at the existing context selection and prompt assembly boundary.

The implementation should create or derive a selection-boundary manifest containing:

- selected context pack ID or IDs;
- exact files selected for each context pack;
- any selected receipt context files when no context pack ID applies;
- normalized project-relative paths;
- display paths for user-facing messages.

The manifest is the source for hashing and receipt persistence. This keeps hashing aligned with the actual context sent into the workflow and avoids re-discovering files later through a different selection path.

## Receipt Metadata Contract

Run receipts that include selected context must persist a versioned selected-context block. The block must be migration-safe and sufficient for later staleness checks.

Required metadata:

- metadata schema/version identifier for the selected-context block;
- selected context pack ID or IDs;
- selected files for each context pack or receipt context;
- normalized project-relative path for each selected file;
- display path for user-facing errors;
- deterministic SHA-256 hash for each selected file, computed from file bytes.

The exact serialized shape may follow existing receipt conventions, but it must keep the selected-context metadata clearly identifiable and versioned so future migrations can distinguish old receipts from receipts that support stale-context checks.

Receipts without this metadata are treated as old or unsupported for this feature’s gate and must not be blocked by stale-context preflight.

## Hashing Requirements

Selected context files must be hashed through a deterministic helper that can be tested independently.

The hashing helper must:

- compute SHA-256 from file bytes;
- avoid hashing display strings, normalized paths, or transformed Markdown;
- return stable hash output for identical file bytes;
- expose path-aware errors for missing or unreadable files where appropriate;
- be usable with temporary fixture files in unit tests.

Path normalization and display-path handling should be separate enough from byte hashing to keep the hash helper pure and easy to test.

## Stale-Context Preflight Behavior

Continuation workflows that depend on previous run context must perform stale-context preflight only when the previous receipt contains selected-context metadata.

The preflight must run before launching Pi.

The preflight must:

1. Read the previous receipt selected-context metadata.
2. For each recorded selected file, resolve the normalized project-relative path.
3. Check whether the file still exists.
4. Recompute the file hash from bytes using the same deterministic SHA-256 helper.
5. Compare the current hash with the recorded hash.
6. Allow continuation when all files exist and match.
7. Block continuation when any recorded file is missing.
8. Block continuation when any recorded file exists but its hash differs.
9. Return or record structured preflight failure data when blocking.

If no previous selected-context metadata exists, the continuation must not be blocked by this feature’s stale-context gate.

## Error Reporting

Stale-context failures must be path-aware, structured, and actionable.

For each affected file, errors should identify:

- the context pack ID when available, or the receipt context when no pack ID applies;
- the display path;
- the normalized project-relative path when useful for debugging;
- whether the file is missing or changed.

Changed-file errors should not require displaying raw hash values to the user, but the implementation may include hashes in structured logs or developer-facing diagnostics if consistent with existing receipt/error conventions.

The failure must be surfaced before Pi starts. This FEAT should not introduce unrelated UI expansion; it only needs to return or record enough structured failure data for existing workflow surfaces to show the blocking reason.

## Acceptance Criteria

1. Current context-pack selection and prompt assembly are audited, with the implementation updated only where needed to identify selected context pack IDs and selected context files.
2. Selected context metadata is captured at the existing context selection and prompt assembly boundary as a selection-boundary manifest.
3. The selection-boundary manifest includes selected context pack IDs or receipt context identifiers, exact selected files, normalized project-relative paths, and display paths.
4. Selected context files are hashed through a deterministic, pure helper that can be tested independently with temporary fixture files.
5. The hashing helper computes SHA-256 from file bytes.
6. Run receipts persist enough context metadata to support later staleness checks, including:
   - a versioned selected-context metadata block;
   - selected context pack ID or IDs;
   - selected file paths;
   - normalized project-relative paths;
   - display paths for errors;
   - per-file SHA-256 hashes.
7. Continuation workflows that depend on a previous run receipt perform a stale-context preflight before launching Pi when that previous receipt contains selected-context metadata.
8. Starts and continuation workflows without previous selected-context metadata are not blocked by this feature’s stale-context preflight.
9. The stale-context preflight allows continuation when all previously recorded context files still exist and match their recorded hashes.
10. The stale-context preflight blocks continuation when any previously recorded context file is missing.
11. The stale-context preflight blocks continuation when any previously recorded context file has changed since the previous run receipt was written.
12. Stale-context failures identify the affected context pack or receipt context, the file path, and whether the file is missing or changed.
13. Stale-context failures are returned or recorded as structured preflight failure data before Pi launch.
14. Tests cover changed, missing, and unchanged selected context files using temporary fixtures.
15. The implementation remains bounded to EPIC-005 runner hardening and does not introduce unrelated workflow layout, UI, or process changes.

## Validation

This FEAT is ready for refinement as focused native runner hardening under EPIC-005.

Refinement and implementation planning should preserve this boundary:

- Audit the existing context selection and prompt assembly path first.
- Capture selected context at the selection boundary instead of rediscovering it later.
- Hash selected context file bytes through pure SHA-256 helpers.
- Persist versioned selected-context metadata in run receipts.
- Run stale-context preflight only for metadata-backed continuations.
- Block before Pi launch when recorded context files are missing or changed.
- Leave starts and old receipts without selected-context metadata unblocked.
- Surface path-aware structured stale-context failures.
- Verify unchanged, changed, and missing-file behavior with focused temporary-fixture tests.
- Avoid unrelated workflow layout, UI, MCP, or process redesign.
