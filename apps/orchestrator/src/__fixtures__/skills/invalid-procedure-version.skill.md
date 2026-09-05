---
hepha-skill-version: "1.0"
name: review-phase
description: "Skill with invalid procedure version format."
skill-procedure-version: "1.2"
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

# Invalid Procedure Version

This fixture tests that a malformed procedure version fails validation.
