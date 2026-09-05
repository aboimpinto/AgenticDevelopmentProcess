# FEAT-052: Skill Versioning And Migration Workflow

**Feature ID**: FEAT-052  
**Parent Epic**: EPIC-009  
**Status**: Completed

## Summary

Version skill metadata using a published semantic version and deterministic content digest. Record both immutable identifiers in new run receipts, validate workflow-node references through a compatibility resolver, provide approval-gated dry-run migration reports for affected references, and preserve historical receipt interpretation across skill-version changes.

## Source

- EPIC: EPIC-009 - Pi Skills And Extensions Integration
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Skill metadata supports an explicit published semantic version and a deterministic digest of the skill content for each published skill version.
- New run receipts record the published semantic version and content digest of every skill used by the run.
- Receipt version identifiers are immutable once recorded and are not changed when a skill is later republished, revised, or migrated.
- A compatibility resolver validates workflow-node skill references and resolves explicitly versioned references to their requested published version.
- During the initial rollout, existing unversioned workflow-node references remain operational by resolving through a documented named default-version policy.
- Resolution of an unversioned workflow-node reference emits a legacy-use diagnostic that identifies the applicable default-version policy and resolved version.
- Existing unversioned workflow-node references are not automatically rewritten during the initial rollout.
- The system generates a dry-run migration report when a skill procedure or version change affects workflow-node references.
- Each dry-run report provides affected-reference evidence, compatibility assessment, and proposed reference changes.
- Rewriting an existing workflow-node reference requires explicit per-reference approval; only individually approved references may be rewritten.
- Historical receipts are not rewritten when skill versions change.
- Receipt interpretation explicitly distinguishes receipts with recorded version-and-digest identifiers from legacy or unknown-version receipts while preserving the meaning of prior runs.
- Migration behavior, compatibility rules, default-version policy, legacy-use diagnostics, approval boundaries, and legacy receipt interpretation are documented for feature refinement, design, and implementation planning.

## Validation

- Confirm metadata schema and publication validation for semantic versions and deterministic content digests.
- Confirm new receipts persist immutable version-and-digest identifiers for every executed skill.
- Confirm resolver behavior for explicitly versioned references, valid unversioned references resolved through the named default-version policy, unavailable versions, and incompatible procedure changes.
- Confirm unversioned reference resolution emits a legacy-use diagnostic without rewriting the source reference.
- Confirm dry-run reports identify affected references, compatibility outcomes, and proposed changes without modifying workflow definitions.
- Confirm migration rewrites require and enforce explicit per-reference approval.
- Confirm historical receipts remain unchanged and can be interpreted as versioned, legacy, or unknown-version records.

## Hepha Deep-Dive Decisions

| Topic | Decision | Implication |
|---|---|---|
| Acceptance contract | Metadata-first compatibility contract | Version skill metadata, record immutable identifiers in new receipts, validate workflow-node references through a compatibility resolver, publish migration notes, and interpret legacy receipts as legacy or unknown without rewriting them. |
| Initial rollout | Additive migration with explicit review | Preserve existing unversioned references through a documented default and legacy policy; provide migration guidance or dry-run reporting; require explicit approval before rewriting references; preserve prior receipt meaning. |
| Version identity | Package version plus content digest | Record the published semantic version and a deterministic digest of skill content in each new receipt for immutable auditability. |
| Compatibility policy | Resolve to documented default version | Keep existing unversioned workflow-node references operational through a named default-version policy and emit a legacy-use diagnostic. |
| Migration execution | Dry-run report with per-reference approval | Produce affected-reference, compatibility, and proposed-change evidence; rewrite only individually approved references. |
