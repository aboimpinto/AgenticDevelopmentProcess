---
hepha-skill-version: "1.0"
name: source-editor-skill
description: "Edit source code files with test verification."
reads:
  - path: "src/**/*.ts"
    description: "TypeScript source files"
writes:
  - path: "src/**/*.ts"
    description: "TypeScript source files"
  - path: "apps/orchestrator/test/**"
    description: "Test files"
outputs:
  - artifact: "test-results"
    path: "logs/test/{runId}-results.log"
    description: "Test output log"
gates:
  - id: "qa-review"
    required: true
safety-profile:
  tool-profile-id: "source-editor"
receipt:
  include-contract-id: true
  include-declared-fields: []
workflow-nodes:
  - node-id: "implementation-loop"
    workflow-command: "continue-implementing"
---

# Source Edit Procedure

1. Read the phase task description.
2. Implement changes to source files.
3. Run tests to verify.
4. Report results.
