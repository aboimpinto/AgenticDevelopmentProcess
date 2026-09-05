---
hepha-skill-version: "1.0"
name: review-phase
description: "Skill with malformed version identity hash."
skill-procedure-version: "1.2.0"
skill-version-id: "sha256:not-a-valid-hex-string"
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

# Malformed Version ID

This fixture tests that an invalid version ID format fails validation.
