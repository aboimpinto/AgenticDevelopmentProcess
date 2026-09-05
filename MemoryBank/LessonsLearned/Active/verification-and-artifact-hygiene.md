# Verification And Artifact Hygiene

These active rules govern executable verification contracts, source audits,
scenario inventories, and file-format checks for authored evidence.

### Rule: Encode The Command Environment In The Verification Contract

- Applies to: start-feature, phase workers, continue-implementation,
  code-review, complete-feature
- Trigger: a verification command depends on a package configuration, working
  directory, executable alias, shared cache, or build directory.
- Instead of: running from an assumed repository root or relying on an
  interpreter/tool alias that may not exist.
- Do: run one package-manager, build, test, lint, format, or verification
  command at a time; inspect its result before starting the next. Encode the
  package working directory explicitly and probe the executable name before
  relying on it. Do not join such commands with `&&` or `&`, and do not launch
  them in parallel tool calls. When proven stale compiled test output can alter
  discovery or environment resolution, remove the relevant `dist/`,
  `dist-types/`, or `build/` output before reproducing the declared command.
- Verify: record the exact command, resolved working directory,
  executable/version, and discovered suite count; confirm the command selected
  the intended profile rather than zero tests or a different package profile.
- Source: FEAT-069 Lessons Learned §8, "Tool working directories and executable
  names are part of the contract"; FEAT-070 Lessons Learned §22, "Artifact
  audits must run after final machine projection and preserve immutable
  identity"; FEAT-071 Lessons Learned §§3 and 7, "Command Working Directory Is
  Part Of The Verification Contract" and "Serialized Command Execution
  Prevents Shared-State Contention"

### Rule: Calibrate Source Audits With Mutually Exclusive Controls

- Applies to: planning audits, implementation evidence, code-review,
  complete-feature
- Trigger: grep, regex, or source-token counts are used as acceptance or
  security evidence.
- Instead of: treating broad word matches or overlapping syntax patterns as
  semantic proof and repairing production code from an unvalidated audit.
- Do: define the exact forbidden tokens and expected counts, make selectors
  mutually exclusive, and classify verifier defects separately from product
  defects.
- Verify: run the selector against a known positive control and a safe negative
  control, inspect every match, and reconcile the observed count before using
  the audit as a gate.
- Source: FEAT-069 Lessons Learned §9, "Source audits need exact, mutually
  exclusive selectors"; FEAT-070 Lessons Learned §20, "Static audits need
  calibrated positive, negative, and semantic controls"

### Rule: Migrate Source-Structure Evidence With Its Owning Refactor

- Applies to: implementation, refactoring, source-inspection tests,
  code-review, final checkpoint
- Trigger: a production refactor deliberately changes names, switches, class
  hierarchy, call structure, or another pattern asserted by source-inspection
  tests.
- Instead of: leaving stale structural assertions for acceptance hardening or
  the final checkpoint, weakening their count, or deleting their historical
  acceptance intent.
- Do: migrate the source-inspection assertions in the owning implementation
  phase and preserve the established test titles and acceptance purpose while
  expressing the new approved structure. When text or behavior moves into an
  extracted helper, retarget `getFunctionSource` or equivalent source matching
  to the new owner. Prefer behavior-level evidence when the structure itself is
  not an authoritative contract.
- Verify: search the affected tests for source matching tied to the old owner,
  run the focused structural suite after the refactor, audit preserved
  titles/assertion inventory, and then run the configured broader profile.
- Source: FEAT-011 Lessons Learned §2, "Refactored Functions Require Test
  Assertion Updates"; FEAT-071 Lessons Learned §2, "Source-Structure Tests Must
  Migrate With The Refactor."

### Rule: Update Scenario Inventory Contracts With Gherkin Changes

- Applies to: refine-feature, Gherkin implementation, acceptance phases,
  complete-feature
- Trigger: a Gherkin scenario is added, removed, renamed in a count-sensitive
  binder, or moved between feature files.
- Instead of: changing the feature file while leaving scenario-count assertions
  or documented inventory totals stale.
- Do: update the scenario, binder inventory assertion, and documented scenario
  counts in the same edit set. Assert the complete expected ID set and require
  every ID exactly once; minimum or `at least` counts are not inventory gates.
- Verify: run the focused binder first, confirm its exact scenario IDs and
  cardinality, and then run the configured broader profile.
- Source: FEAT-069 Lessons Learned §10, "Scenario inventory assertions must
  change with Gherkin additions"; FEAT-070 Lessons Learned §21, "Scenario
  inventories should be exact, executable, and non-duplicative"; FEAT-071
  Lessons Learned §4, "Exact Acceptance Inventories Prevent Drift"

### Rule: Await Promise Matcher Assertions

- Applies to: unit tests, integration tests, Vitest/Jest assertions,
  code-review
- Trigger: a test uses `.rejects` or `.resolves` against a promise.
- Instead of: starting the matcher chain without awaiting or returning it,
  allowing a warning or late assertion to escape the test's settlement.
- Do: make the test asynchronous and `await` the complete promise matcher (or
  return it where the runner contract explicitly supports that form).
- Verify: rerun the focused test warning-free and confirm the asserted
  rejection/resolution fails the test when its expectation is inverted.
- Source: FEAT-071 Lessons Learned §5, "Await Async Rejection Assertions."

### Rule: Discover Local Schemas Read-Only Before Querying

- Applies to: start-feature, baseline discovery, persistence audits,
  recovery investigation
- Trigger: an agent must inspect an existing local database whose schema or
  sensitive columns are not already authoritative in current source.
- Instead of: guessing table names, opening a writable connection, or selecting
  credential-bearing rows during discovery.
- Do: open read-only, inspect schema metadata such as `sqlite_master` and
  `PRAGMA table_info`, then query only allowlisted non-secret identity, label,
  state, and count fields.
- Verify: record the discovered table/column names and read-only connection mode;
  confirm no migration, journal, row, or secret-bearing field was written or
  exposed.
- Source: FEAT-070 Lessons Learned §3, "Read-only baseline inspection should
  discover the actual schema first"

### Rule: Verify UI Acceptance Through Public Browser Composition

- Applies to: design-feature, web implementation, accessibility review,
  acceptance hardening, complete-feature
- Trigger: accepted UI behavior depends on focus timing, duplicated visible text,
  responsive layout, or shell-level composition outside a focused component.
- Instead of: treating jsdom/component success as proof of browser accessibility
  or document-level responsive behavior.
- Do: run the journey through the public dashboard, scope locators to semantic
  facts/disclosures, move focus only after the alert or target is committed, and
  verify the composed shell at constrained viewports.
- Verify: assert semantic focus and announcements after render settlement,
  document-level overflow at the required viewport, and the combined public
  browser regression after focused component checks. If policy, environment,
  or server availability prevents execution, report the exact discovered spec
  inventory as **not executed**; spec presence is never a browser pass.
- Source: FEAT-070 Lessons Learned §16, "Public browser composition finds timing
  and layout defects below component scope"; FEAT-071 Lessons Learned §9,
  "Playwright Spec Inventory Is Not A Browser Pass"

### Rule: Control Every Browser Boundary That Determines The Assertion

- Applies to: refine-feature, Playwright fixtures, acceptance hardening,
  complete-feature
- Trigger: a deterministic browser scenario depends on malformed, failed,
  delayed, or otherwise controlled API behavior.
- Instead of: using the absence of an interceptor as the negative fixture or
  assuming no local API, proxy, or preview service can answer a current route.
- Do: inventory and intercept every current public endpoint that can affect the
  assertion; return an explicit contract-valid positive fixture or intentional
  malformed/failure fixture as the scenario requires.
- Verify: run the scenario with a reachable local API, audit sibling interceptors
  after transport migration, and then run the combined browser-owner regression.
- Source: FEAT-070 Lessons Learned §§18 and 25, "Cross-feature browser runs are
  migration checks" and "Negative browser fixtures must intercept every current
  public boundary"

### Rule: Keep Blocking Gates Separate From Coverage Telemetry

- Applies to: phase checkpoints, coverage reporting, continue-implementation,
  complete-feature
- Trigger: build/typecheck/lint/test gates and one or more coverage profiles are
  reported together.
- Instead of: allowing missing or misclassified advisory coverage to overwrite
  a settled test result, or using one unavailable profile to erase another valid
  measurement.
- Do: persist each blocking gate and each coverage profile in separate typed
  fields/namespaces; record the profile and working directory for every
  measurement and display unavailable telemetry as non-blocking unless the
  refined contract explicitly makes that profile a gate.
- Verify: test green gates with unavailable coverage, multiple independent
  coverage profiles, and terminal reconciliation; prove advisory rows cannot
  route the workflow back into implementation.
- Source: FEAT-070 Lessons Learned §§24 and 26, "Blocking verification gates and
  coverage telemetry are independent" and "Authoritative terminal state and
  advisory evidence need separate namespaces"; FEAT-071 Lessons Learned §6,
  "Non-Blocking Coverage Is Not A Gate Substitute"

### Rule: Audit Authored Artifacts Without Rewriting Historical Identity

- Applies to: phase checkpoints, Feature Lessons Writer, complete-feature,
  MemoryBank archival
- Trigger: touched files include untracked Markdown/JSON or a completion move
  contains historical manifests, receipts, verification packs, or intentional
  Markdown hard breaks.
- Instead of: assuming `git diff --check` covers untracked files or scanning and
  normalizing the entire moved historical tree.
- Do: enumerate all touched authored files from tracked and untracked status,
  audit those files directly for terminal newlines and unintended trailing
  whitespace after the final machine projection, and preserve
  content-addressed/generated historical artifacts and intentional hard breaks
  unchanged.
- Verify: inspect `git status --short`, run direct format checks only on touched
  authored Markdown/JSON after the last projection, use fail-fast commands and
  robust quoting, run `git diff --check`, and confirm historical
  identity-bearing artifacts have no content diff.
- Source: FEAT-069 Lessons Learned §11, "Untracked workflow artifacts need
  explicit file-format checks"; §12, "Completion formatting audits must
  preserve historical artifact identity"; FEAT-070 Lessons Learned §22,
  "Artifact audits must run after final machine projection and preserve
  immutable identity"
