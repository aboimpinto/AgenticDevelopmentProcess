# FEAT-047: Hepha Skill Contract And File Format

**Feature ID**: FEAT-047  
**Parent Epic**: EPIC-009  
**Status**: Completed

## Summary

Define a strict executable format for Hepha skills with mandatory metadata, including reads, writes, outputs, gates, safety profile, version, and receipt fields. Link skills to workflow nodes. Validate the complete executable contract before launch and deterministically reject incomplete or misaligned skills, including gate, context, and safety alignment.

## Source

- EPIC: EPIC-009 - Pi Skills And Extensions Integration
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Define a strict, versioned skill file format with required metadata for declared reads, writes, outputs, gates, safety profile, and receipt fields.
- Define how a skill contract links to one or more workflow nodes.
- Validate a complete skill contract during existing pre-launch workflow loading, before any skill execution begins.
- Validate alignment between the skill’s declared context, workflow-node context, configured gates, and safety profile.
- Reject contracts deterministically before launch when required fields are missing, malformed, unsupported, or misaligned.
- Produce actionable validation results that identify the invalid contract field or alignment failure without exposing secrets.
- Cover valid contracts, incomplete contracts, and gate/context/safety-misaligned contracts with automated tests.

## Scope

Implement the strict skill format and validator, integrate validation with existing pre-launch workflow loading, and test valid, incomplete, and misaligned contracts.

Out of scope:

- Replacing Pi as the skill execution runtime.
- Expanding workflow execution features beyond the pre-launch contract validation required for this feature.
- Creating new workflow nodes or new approval models unrelated to skill contract validation.

## Hepha Deep-Dive Decisions

| Topic | Decision |
|---|---|
| Acceptance-criteria baseline | Contract and pre-launch validation |
| Delivery boundary | Focused contract integration |
| Required validation | Skill metadata, workflow-node links, gate/context/safety alignment, receipt fields, and deterministic pre-launch rejection |
| Test coverage | Valid, incomplete, and misaligned contracts |
