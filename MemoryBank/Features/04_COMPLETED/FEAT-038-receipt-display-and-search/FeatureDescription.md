# FEAT-038: Receipt Display And Search

**Feature ID**: FEAT-038  
**Parent Epic**: EPIC-007  
**Status**: Completed

## Summary

Display run receipts in read-only detail views and provide deterministic receipt search by artifact, command, model, and knowledge rule. Link receipts to EPIC, FEAT, phase, and workflow node context. Include agent invocation-ledger evidence in receipt views so completion evidence shows which commands ran, which models were used, and which review or recovery agents were involved.

## Source

- EPIC: EPIC-007 - Observability Traces And Run Analytics
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance boundary | Implement detail views plus receipt search. |
| Display scope | Add read-only receipt rendering in relevant detail views. |
| Search scope | Support searching receipts by artifact, command, model, and knowledge rule. |
| Linking scope | Link receipts to EPIC, FEAT, phase, and workflow node context. |
| Evidence scope | Include invocation-ledger evidence showing commands, models, review agents, and recovery agents. |
| Receipt data source | Use existing receipt artifacts as the receipt source of truth and join existing timeline or agent-invocation ledger data read-only. |
| Search semantics | Implement explicit field filters with predictable exact or case-insensitive substring matching through pure query functions and focused tests per dimension. |
| UI and API contract | Add compact read-only receipt panels or links in EPIC, FEAT, phase, and workflow-node detail views plus one focused receipt search view backed by standalone additive DTOs. |
| Implementation boundary | Keep the FEAT limited to read-only observability using additive shared types, pure query functions, thin APIs, and tests. |
| Explicit non-goal | Do not change workflow execution or receipt-writing behavior. |

## Scope

FEAT-038 is a bounded read-only observability slice for surfacing receipt evidence that already exists or is produced elsewhere in the workflow system.

The receipt source of truth is the existing receipt artifacts. Invocation evidence should be joined read-only from existing timeline or agent-invocation ledger data. This FEAT must not introduce new receipt-writing semantics or execution-side changes.

This FEAT may add:

- Additive shared types or DTOs for:
  - receipt display;
  - receipt search filters;
  - receipt search results;
  - receipt context links;
  - invocation-ledger evidence.
- Pure query functions for filtering and retrieving receipts by supported search dimensions.
- Thin read-only API endpoints or handlers needed by the UI to read receipt and invocation-ledger data.
- Compact read-only receipt panels or links in EPIC, FEAT, phase, and workflow-node detail views.
- One focused receipt search view backed by the additive read API and DTOs.
- Tests for query behavior, API behavior, display behavior, context linking, and invocation-ledger evidence serialization or rendering.

This FEAT must not:

- Modify workflow execution behavior.
- Modify receipt-writing behavior.
- Introduce new receipt production semantics.
- Change how commands, models, review agents, or recovery agents are invoked.
- Add mutation flows for receipt records.
- Treat timeline or invocation-ledger data as writable from receipt display or search flows.

## Search Semantics

Receipt search should use deterministic fielded filters for the first implementation.

Supported search dimensions:

- artifact;
- command;
- model;
- knowledge rule.

Search behavior:

- Each supported dimension should be represented as an explicit field filter.
- Matching should be predictable and implemented through pure query functions.
- Exact matching may be used where identifiers or canonical names are available.
- Case-insensitive substring matching may be used for user-facing text fields where exact identifiers are not required.
- Tests should cover each supported dimension independently.
- Search results should include enough receipt and workflow context for the user to identify the match and navigate to the related detail view.

## UI And API Contract

The UI should expose receipt information through both embedded context and a focused search workflow.

Required UI surfaces:

- Compact read-only receipt panels or receipt links in:
  - EPIC detail views;
  - FEAT detail views;
  - phase detail views;
  - workflow-node detail views.
- A focused receipt search view for filtering receipts by artifact, command, model, and knowledge rule.
- Receipt detail rendering that shows context links and invocation-ledger evidence.

API expectations:

- APIs should be thin read-only wrappers over the receipt query layer.
- API DTOs should be standalone and additive.
- API responses should not expose mutation operations for receipt data.
- Receipt display data should be composed from existing receipt artifacts and read-only timeline or invocation-ledger evidence.

## Acceptance Criteria

- Receipt details are displayed read-only in relevant EPIC, FEAT, phase, and workflow-node detail views.
- Compact receipt panels or links are available from EPIC, FEAT, phase, and workflow-node detail views where receipt context exists.
- A focused receipt search view is available.
- Receipt search supports explicit fielded filtering or lookup by:
  - artifact;
  - command;
  - model;
  - knowledge rule.
- Receipt search uses deterministic matching semantics through pure query functions, using exact matching or case-insensitive substring matching as appropriate for each field.
- Search results provide enough context for a user to identify the matching receipt and navigate to its related workflow context.
- Receipt views include links or references back to the related:
  - EPIC;
  - FEAT;
  - phase;
  - workflow node.
- Receipt views use existing receipt artifacts as the receipt source of truth.
- Receipt views join existing timeline or agent-invocation ledger data read-only for invocation evidence.
- Receipt views include invocation-ledger evidence showing:
  - commands that ran;
  - models that were used;
  - review agents involved;
  - recovery agents involved.
- Receipt display and search are implemented as read-only observability features.
- Shared data structures introduced for this FEAT are additive and do not break existing workflow, receipt, timeline, or invocation-ledger consumers.
- UI-facing APIs are thin read APIs over the receipt query layer.
- Tests cover receipt search by artifact, command, model, and knowledge rule.
- Tests cover exact or case-insensitive substring matching behavior for supported filters where applicable.
- Tests cover receipt linking to EPIC, FEAT, phase, and workflow node context.
- Tests cover invocation-ledger evidence rendering or serialization.
- Existing workflow execution and receipt-writing behavior remain unchanged.

## Validation

This FEAT is confirmed as a bounded read-only observability slice for receipt display and deterministic receipt search.

The feature is ready for refinement, design decisions, and implementation planning with the following validated constraints:

- implement receipt display and search only;
- use existing receipt artifacts as the receipt source of truth;
- join existing timeline or agent-invocation ledger data read-only for invocation evidence;
- preserve existing workflow execution behavior;
- preserve existing receipt-writing behavior;
- prefer additive shared types and standalone DTOs;
- use pure query functions for receipt lookup and filtering;
- expose only thin read APIs where APIs are needed;
- add compact embedded receipt panels or links in relevant detail views;
- add one focused receipt search view;
- include tests for search, matching semantics, linking, and invocation-ledger evidence.
