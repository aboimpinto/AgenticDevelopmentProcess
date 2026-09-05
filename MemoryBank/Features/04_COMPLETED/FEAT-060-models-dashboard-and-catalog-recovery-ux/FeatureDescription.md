# FEAT-060: Models Dashboard And Catalog Recovery UX

**Feature ID**: FEAT-060  
**Parent Epic**: EPIC-011  
**Status**: Completed  
**Priority**: P1  

## Summary

Create one accessible `Models` dashboard destination that brings together Provider Connections, the current safe model catalog projection, failed-scan recovery behavior, and a read-only Routing Defaults handoff.

## Source

- EPIC: EPIC-011 - Model Catalog And Hierarchical Action Routing
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- FEAT-060 consumes the current FEAT-059 catalog projection unchanged. It renders only current safe fields using immutable `connectionId + modelId` identity. Missing display fields are documented as MVP gaps rather than inferred or synthesized.
- When a connection scan fails, clear only that connection's selectable catalog rows and selected model. Retain unaffected connections, rows, and selections, and show sanitized recovery diagnostics.
- Routing Defaults is a read-only neutral handoff. Editable policy, reset, acknowledgement, and runtime behavior remain owned by FEAT-061 and FEAT-062.

## Acceptance Criteria

- The dashboard exposes one accessible `Models` destination with Provider Connections, Available Models, and a neutral Routing Defaults handoff.
- Provider Connections is composed from FEAT-058 without duplicating provider lifecycle or secret-management behaviour.
- Available Models renders only the current FEAT-059 catalog projection, using immutable `connectionId + modelId` identity, current safe detail fields, and explicit unknown values.
- Missing catalog display fields are treated as documented MVP gaps; the dashboard does not infer, synthesize, or expose unsupported model data.
- A failed scan removes only the affected connection's selectable rows and selected value, retains unaffected rows and selections, and presents safe actionable diagnostics without secret-bearing data.
- Scan controls, tabs, catalog listbox, focus behavior, responsive layout, reduced-motion attention, deterministic browser coverage, and secret-sink regressions meet the refined design contract.
- Routing Defaults provides a read-only neutral handoff identifying FEAT-061 and FEAT-062 as the owners of routing defaults, with no editable policy, reset, acknowledgement, worker injection, or runtime receipt behavior.
- Routing policy, route reset, policy revision, acknowledgement persistence, worker injection, and runtime receipts remain named FEAT-061/062 responsibilities.

## Dependencies

- FEAT-058
- FEAT-059

## Validation

- The generated feature scope is accepted for refinement.
