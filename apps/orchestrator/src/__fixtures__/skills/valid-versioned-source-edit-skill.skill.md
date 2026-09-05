---
hepha-skill-version: "1.0"
name: source-editing-skill
description: "Edit source files according to review findings (versioned)."
skill-procedure-version: "2.0.0"
skill-version-id: "sha256:d75ea88c796f1b81c80fbbfc8af4c457990ef345e88e2e0dfeca225211040296"
migration-notes: ".hepha/skills/source-editing-skill/MIGRATIONS.md#2.0.0"
reads:
  - path: "src/**/*.ts"
    description: "Source files to read"
writes:
  - path: "src/**/*.ts"
    description: "Source files to write"
outputs:
  - artifact: "edit-report"
    path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-edits.md"
    description: "Edit report"
gates:
  - id: "code-review"
    required: true
safety-profile:
  tool-profile-id: "source-editor"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "apply-fixes"
    workflow-command: "continue-implementing"
---

# Source Editing Procedure (Versioned)

1. Read the review findings.
2. Apply fixes to source files.
3. Verify the changes compile.
