# Active LessonsLearned Rule Index

Active rules are compact project constraints selected before raw lesson
history. Each promoted rule states its trigger, replacement behavior,
verification gate, and source reference.

## Rule Files

- [`code-quality-assumptions.md`](code-quality-assumptions.md) — compatibility,
  contract-closed fixtures, repair gates, workflow authority, review chronology,
  runtime validation, contract transitions, and backend integration coverage.
  FEAT-011 §4 adds authoritative backend enforcement for completion gates.
  FEAT-069 and FEAT-070 strengthen its state-matrix, migration-inventory,
  terminal-predicate, owning-phase review, post-fix full-profile, final
  reconciliation, and configurable-asset override validation rules. FEAT-071
  §§1, 8, and 10 strengthen final review chronology and startup authority
  validation.
- [`single-responsibility-production-modules.md`](single-responsibility-production-modules.md)
  — production module ownership, behavioral evidence, test-only code, and
  extraction records. FEAT-069 §7 strengthens its per-exported-method test
  rule.
- [`runtime-state-and-boundary-rules.md`](runtime-state-and-boundary-rules.md) —
  replay-safe recovery, durable joins, sparse-to-complete projections,
  transaction settlement, request-bound async UI state, and concurrency
  synchronization. Sources: FEAT-069 Lessons Learned §§2–4 and 6; FEAT-070
  Lessons Learned §§1, 5–6, 8, and 10–14.
- [`verification-and-artifact-hygiene.md`](verification-and-artifact-hygiene.md)
  — command environments, exact source audits, Gherkin inventory contracts,
  read-only schema discovery, deterministic browser fixtures, gate/coverage
  separation, and diff-aware artifact checks. FEAT-011 §2 adds extracted-helper
  ownership for source-structure assertions. FEAT-071 adds serialized
  command-environment evidence, owning-phase source-structure test migration,
  exact scenario-ID inventories, awaited promise matchers, and honest
  not-executed browser inventory reporting. Sources: FEAT-069 Lessons Learned
  §§8–12; FEAT-070 Lessons Learned §§3, 16, 18, 20–22, and 24–26; FEAT-071
  Lessons Learned §§2–7 and 9.
- [`structured-markdown-transformations.md`](structured-markdown-transformations.md)
  — nested code-fence-aware parsing and single-write idempotent section update
  pipelines. Sources: FEAT-011 Lessons Learned §§1 and 3.

## Selection Guidance

- Select `runtime-state-and-boundary-rules.md` for stateful persistence,
  recovery, concurrency, transport, or asynchronous UI work.
- Select `verification-and-artifact-hygiene.md` when defining or executing
  commands, source audits, Gherkin or browser-fixture changes, phase checkpoints,
  coverage reporting, or completion archival.
- Select `structured-markdown-transformations.md` when parsing or updating
  machine-consumed EPIC, FEAT, or lifecycle Markdown.
- Select `code-quality-assumptions.md` for all implementation and independent
  review work.
- Select `single-responsibility-production-modules.md` when creating,
  extracting, or reviewing production modules.
