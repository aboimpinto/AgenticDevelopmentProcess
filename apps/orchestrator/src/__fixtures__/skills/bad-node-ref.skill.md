---
hepha-skill-version: "1.0"
name: bad-node-ref-skill
description: "References non-existent workflow command"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "nonexistent-node"
    workflow-command: "nonexistent-command"
---

Body content.
