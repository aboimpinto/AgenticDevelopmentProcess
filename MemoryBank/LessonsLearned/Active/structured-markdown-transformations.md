# Structured Markdown Transformations

These active rules govern parsers and idempotent updates for machine-consumed
Markdown documents.

### Rule: Preserve Fence Boundaries At Every Parser Level

- Applies to: Markdown parsers, EPIC and FEAT document readers, implementation,
  code-review
- Trigger: a section parser skips fenced examples while nested loops or helper
  scanners can consume lines independently.
- Instead of: toggling fenced-content state only in an outer loop while an inner
  scanner consumes the opening or closing delimiter as section content.
- Do: recognize supported fence delimiters before every parser level consumes a
  line. A nested scanner must stop at a fence boundary and return control to the
  scanner that owns fence-state transitions, so headings inside fenced examples
  cannot become lifecycle sections.
- Verify: exercise the target heading before, inside, and after a fenced block;
  include a case where a nested section scan reaches each fence delimiter and
  prove only headings outside the block are parsed.
- Source: FEAT-011 Lessons Learned §1, "Code-Fence Boundary Bug in Markdown
  Parsing."

### Rule: Compose Idempotent Section Transforms Before One Write

- Applies to: EPIC and FEAT document updaters, lifecycle synchronization,
  persistence, code-review
- Trigger: one operation may update multiple derived or machine-managed Markdown
  sections.
- Instead of: mutating or writing the file independently for each section, or
  reporting a change without comparing the rendered section with current text.
- Do: implement each section adjustment as a pure transform that returns the
  resulting Markdown plus an actual-change flag and summary. Pipeline the
  transforms in document order, then write the final document once and only when
  at least one transform changed it.
- Verify: cover a byte-identical no-op, each section changing alone, and several
  sections changing together; assert zero writes for the no-op and exactly one
  final write for every changed operation.
- Source: FEAT-011 Lessons Learned §3, "Idempotent EPIC Markdown Upsert Pattern
  Confirmed."
