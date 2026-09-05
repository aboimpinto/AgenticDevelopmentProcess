# Single-Responsibility Production Modules

These rules apply to every direct refactor and every future HEPHA-managed
implementation. They are active engineering constraints, not optional style
advice.

## One Responsibility Per Production File

- A production file owns one responsibility that can be stated in one
  sentence. A filename such as `helpers.ts`, `utils.ts`, `common.ts`, or
  `legacy.ts` is not an ownership definition.
- Keep related files together in a topic folder. Separate pure policy,
  application coordination, transport, presentation, and infrastructure even
  when they belong to the same topic.
- Prefer production files at or below 500 lines. A cohesive file between 501
  and 1,000 lines requires an explicit responsibility review. A file above
  1,000 lines is not an accepted end state.
- `index.ts` is an export or composition surface. It must not accumulate the
  implementation behind the exports.
- Extract by observable responsibility and dependency direction. Moving a
  large block into another large file does not resolve a monolith.

## Every Production Method Needs Behavioural Evidence

- Every exported production function, method, and decision must have focused
  unit tests for its positive, negative, and failure behaviour. Shared guard
  coverage or coverage through one sibling consumer does not replace direct
  valid and rejected controls through each exported transport method.
- Private helpers remain private. Their statements and branches are exercised
  by the focused unit tests of the owning exported behaviour; do not export an
  implementation detail merely so a test can call it.
- Every production method must be reachable from a real production entry
  point. Its owning public capability must be exercised by a generic Gherkin
  integration scenario through the real composition path.
- Gherkin scenarios describe public behaviour, not historical FEAT numbers,
  phase names, filenames, or private helpers. One scenario may exercise
  several internal methods in the same production call chain.
- A test that searches source text, reconstructs the expected implementation,
  or calls an unwired adapter is not integration evidence.
- Source reference for per-method transport controls: FEAT-069 Lessons Learned
  §7, "Every public transport method needs its own valid and rejected control."

## Test-Only Code Does Not Belong In Production

- Before extracting a symbol, search all production and test callers.
- If a production symbol is referenced only by tests, remove it from
  production. Delete obsolete tests, replace them with tests of public
  behaviour, or move genuine fixture builders under a test-only directory.
- Do not preserve test-only production exports in a generic quarantine or
  compatibility module. A temporary re-export is allowed only for one bounded
  migration step and must have a named removal condition.
- If a test requires substitutable I/O, inject an explicit port or dependency.
  Do not add process-global `setSomethingForTest` mutation to production.
- If a symbol has no production or test caller, delete it after verifying that
  no reflective, configuration, command, or serialization boundary resolves it
  by name.

## Required Extraction Record

Every extraction records:

1. the new module's one-sentence responsibility;
2. every production caller and public entry point;
3. side effects and injected ports;
4. focused unit-test ownership;
5. the generic Gherkin scenario that traverses the production path;
6. test-only and unreachable symbols deleted or relocated;
7. compatibility exports introduced and their removal condition;
8. resulting production-file line counts.

## History

- **Orchestrator modularization (2026-07-20):** The direct refactor began after
  `apps/orchestrator/src/index.ts` reached 20,714 lines and mixed HTTP
  transport, application coordination, workflow policy, Pi runtime,
  persistence, filesystem mutation, and presentation. The architecture and
  extraction circuit are documented in
  [`docs/architecture/orchestrator-modularization-refactor.md`](../../../docs/architecture/orchestrator-modularization-refactor.md).
- The initial inventory also found production fixture builders used only by
  tests and old web-shell components with no production call path. Those are
  removal or test-fixture relocation candidates, not reusable production
  modules.
