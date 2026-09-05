---
hepha-skill-version: "1.0"
name: review-phase
description: "Versioned skill where declared version ID does not match canonical content hash."
skill-procedure-version: "1.2.0"
skill-version-id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
migration-notes: ".hepha/skills/review-phase/MIGRATIONS.md#1.2.0"
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

# Hash Mismatch Fixture

This fixture's declared version ID does not match the computed canonical hash.
