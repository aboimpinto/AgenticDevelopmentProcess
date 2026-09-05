---
hepha-skill-version: "1.0"
name: review-phase
description: "Review a completed phase for quality-gate compliance and findings (versioned)."
skill-procedure-version: "1.2.0"
skill-version-id: "sha256:8846704ee0a39ffed1c274dcc2d4af13b8d00cb70c31f6164385dd89138e200f"
migration-notes: ".hepha/skills/review-phase/MIGRATIONS.md#1.2.0"
reads:
  - path: "MemoryBank/Features/**/Phases/phase-{N}.md"
    description: "Phase document with completed tasks and evidence"
writes:
  - path: "MemoryBank/Features/**/code-reviews/"
    description: "Code review report directory"
outputs:
  - artifact: "code-review-report"
    path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-review.md"
    description: "Persisted review findings report"
gates:
  - id: "code-review"
    required: true
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
  include-declared-fields:
    - reads
    - writes
    - outputs
    - gates
    - safety-profile
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

# Review Phase Procedure (Versioned)

1. Read the phase document.
2. Check each quality gate evidence row.
3. Write findings to the code review report.
4. Return structured findings.
