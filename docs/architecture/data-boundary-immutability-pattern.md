# Data Boundary and Immutability Pattern

## Principle

DTOs (data transfer objects) that carry lifecycle state must validate their
invariants **at construction**. Downstream functions — planners, routers,
validators, workers — receive guaranteed-valid input and must not correct,
coerce, or compensate for invalid state.

This eliminates the class of bugs where an impossible combination of fields
propagates through the system until a deep routing function silently corrects
it, overfitting to the specific incident rather than preventing the class of
error.

## Pattern

```
Raw fields ──► Factory ──► Validated DTO ──► Pure function(s)
                (readonly    (impossible
                 + clamp      states cannot
                 invariant)   exist)
```

### Rules

1. **All DTO fields must be `readonly`.** Once constructed, a validated DTO
   cannot be mutated. State changes produce a new DTO through the factory.

2. **A factory function constructs the DTO.** The factory is the only way to
   obtain a valid instance. It receives raw input and returns a guaranteed-valid
   DTO. Impossible field combinations are clamped or rejected at this boundary.

3. **Downstream functions trust their input.** A planner, router, executor, or
   validator that receives a validated DTO must not check for or correct
   impossible field combinations. If the input is bad, the factory is wrong —
   fix the factory, not the downstream function.

4. **Defense-in-depth is allowed but documented.** A downstream function may
   call the factory internally as an assertion that its input is valid. This is
   not an alternative correction path; it is a safety net that surfaces the
   contract violation at the nearest caller boundary.

5. **Unit tests prove every clamp branch.** The factory's invariant enforcement
   must have explicit test coverage:
   - the clamp triggers correctly for each impossible combination;
   - the clamp does not trigger when the combination is legitimate
     (e.g., rerun + prior review evidence);
   - normal input passes through unchanged.

6. **Gherkin scenarios document the invariant.** The invariant is part of the
   published specification. A scenario asserts that the system cannot enter
   the impossible state, using generic phase/work/review terms, never
   FEAT-specific IDs or phase numbers.

### Derived state example

The `derivePhaseState` function in `phase-lifecycle-policy.ts` derives phase
lifecycle state from `PhaseFacts` — a pure DTO with only deterministic YES/NO/N/A
values. Phase state is never read from the `**Status:**` field in the phase
document. This makes impossible states unrepresentable: a phase with all tasks
done, an approved review, and an autonomous workflow is always COMPLETED,
regardless of what the display field says.

See `docs/architecture/simple-phase-executor.md` for the full derivation table.

### Factory example

The `PhaseReviewResumePlanningInput` DTO and `createPhaseReviewResumePlanningInput`
factory in `apps/orchestrator/src/workflows/phases/phase-review-resume-planner.ts`
are the canonical factory-pattern example.

**Impossible state prevented:**

- `awaitingIndependentRerun: true` (a rerun is requested)
- `nextOrderedTaskKind: "code_review"` (the next task is a first review)
- No prior review evidence (no failure context, report result, or durable artifact)

A phase awaiting its first baseline independent review cannot simultaneously be
awaiting a rerun. The factory clamps `awaitingIndependentRerun` to `false` when
this combination is detected. The routing function `planPhaseReviewResume` never
sees the impossible state.

**Legitimate rerun preserved:**

- `awaitingIndependentRerun: true`
- `nextOrderedTaskKind: "code_review"`
- Prior review evidence present (failure context, report, or durable artifact)

The factory preserves `awaitingIndependentRerun: true`. The rerun proceeds to
the reviewer with its exact predecessor lineage.

## Motivation

This pattern was introduced after a production incident (FEAT-011, Phase 2)
where:

1. An unscoped session-text scan set `awaitingIndependentRerun: true` for a
   phase that had never been reviewed.
2. A downstream planner received both `awaitingIndependentRerun: true` and
   `nextOrderedTaskKind: "code_review"` — an impossible combination.
3. The routing function prioritized rerun over baseline because both booleans
   were true, and rerun appeared first in the precedence chain.
4. The rerun executor failed with `REVIEW_CONTRACT_V1_RERUN_LINEAGE_UNAVAILABLE`
   because no prior review artifact existed.

The fix was not to add another precedence rule or a phase-specific exception.
The fix was to make the impossible combination structurally impossible at the
DTO boundary.

## Adoption

When adding or modifying a DTO that carries lifecycle state:

- Can any combination of its fields represent an impossible state?
  - If yes, add a factory that clamps or rejects that combination.
  - If no, document that the DTO has no invariant enforcement.
- Is the DTO consumed by multiple downstream functions?
  - If yes, validation at the boundary is mandatory.
- Is the DTO constructed from user input, session data, or external state?
  - If yes, validation at the boundary is mandatory.

Do not add validation inside downstream functions as an alternative to fixing
the DTO boundary. The factory is the single source of truth for state validity.
