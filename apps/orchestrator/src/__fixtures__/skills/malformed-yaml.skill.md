---
hepha-skill-version: "1.0"
name: malformed-yaml-skill
description: "Malformed YAML"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
  : invalid
---

Body content.
