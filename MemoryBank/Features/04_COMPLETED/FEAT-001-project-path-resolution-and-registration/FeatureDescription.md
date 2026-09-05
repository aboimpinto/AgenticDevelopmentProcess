# FEAT-001: Project Path Resolution And Registration

**Feature ID**: FEAT-001
**Parent Epic**: EPIC-001
**Status**: Completed

## Summary

Implement deterministic path resolution for project registration, storing canonical paths for execution while preserving original user-entered paths for UX and troubleshooting. Support absolute, relative, and home-relative paths with clear validation errors.

## Source

- EPIC: EPIC-001 - Hepha Self Hosting And Project Registry
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Scope

This feature is limited to deterministic project path resolution and registration behavior for:

- Resolving canonical project paths from absolute, relative, and home-relative user inputs
- Persisting the original user-entered path alongside the canonical path
- Producing clear validation errors for missing folders and invalid project roots
- Adding regression test coverage for supported path-resolution behavior

Out of scope:

- Broader project registry lifecycle features
- Project metadata beyond path fields required for registration
- UI redesign beyond displaying or using the preserved original path where relevant
- Runtime execution behavior unrelated to canonical project path usage

## Acceptance Criteria

- Canonical paths are resolved for absolute, relative, and home-relative inputs.
- Original user-entered paths are persisted alongside canonical paths.
- Validation error messages are provided for missing folders or invalid project roots.
- Regression tests cover supported path behaviors.
