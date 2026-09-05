---
hepha-skill-version: "1.0"
name: review-phase
description: "Versioned skill without migration notes reference."
skill-procedure-version: "1.2.0"
skill-version-id: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
reads:
  - path: "MemoryBank/Features/**/Phases/phase-{N}.md"
    description: "Phase document"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

# Missing Migration Notes

This fixture has a versioned skill but no migration-notes field.
