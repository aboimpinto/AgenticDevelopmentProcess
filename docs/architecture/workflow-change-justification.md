# Workflow Change Justification

## Rule

Every change that can affect workflow routing, transition guards, retries,
recovery, cancellation, durable workflow status, or phase/feature completion
must have a justification record in
[`workflow-change-justification-log.json`](workflow-change-justification-log.json).
Documentation-only changes to the workflow map also require a record because a
wrong diagram sends incident diagnosis to the wrong code.

The record must answer these questions with concrete evidence:

1. **Why happened?** Describe the observed failure or ambiguity, including the
   state and transition that did not behave as intended.
2. **What led to the issue?** Give the causal chain from durable input through
   the owning decision method to the wrong or missing result.
3. **Why did we not have a proper test?** Name the absent decision boundary,
   route, fixture, or assertion. “Coverage was missing” is not sufficient.
4. **What was missing, or which decision led to the error?** Identify the
   missing invariant or the earlier design decision that allowed the behavior.

Each record must also identify affected `WF-*` transition IDs, production files
changed, and both unit and Gherkin tests added or updated.

## Required sequence

1. Reproduce the failure against a stable transition ID.
2. Add or change the unit test for the owner method.
3. Add or change the Gherkin scenario for the observable route.
4. Implement the smallest generic correction.
5. Update the transition registry and diagrams when ownership or behavior
   changes.
6. Add the justification record and run the workflow-map policy.

Do not use a FEAT ID, phase number, task name, filename, report formatting, or
one incident's prose as generic routing logic. Such details may appear in the
incident evidence, but the correction must be expressed as durable state and a
generic transition condition.

## JSON record shape

```json
{
  "id": "WJ-YYYY-NNN",
  "date": "YYYY-MM-DD",
  "summary": "Short behavior-oriented title",
  "transitionIds": ["WF-..."],
  "whyHappened": "Observed failure or ambiguity.",
  "causalChain": "Durable input -> owner method -> wrong or missing result.",
  "testGap": "Exact missing unit/Gherkin boundary.",
  "missingDecision": "Missing invariant or prior design decision.",
  "codeChanges": ["path/to/production-or-documentation-file"],
  "testsAdded": [
    "path/to/unit.test.ts",
    "path/to/scenario.feature",
    "path/to/scenario.integration.test.ts"
  ]
}
```

The deterministic policy verifies the shape, transition IDs, file paths, and
presence of both unit and Gherkin evidence. Human review evaluates whether the
answers actually explain causality and justify changing the workflow.
