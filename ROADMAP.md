# HEPHA Roadmap

This roadmap communicates direction rather than a release commitment. The
order may change as real project use exposes better priorities.

## Current focus

- Make delivery status evidence-based across automated, manual, deferred, and
  uncovered acceptance criteria.
- Strengthen workflow recovery, stale-run detection, and durable resume.
- Continue decomposing the orchestrator into clear application and adapter
  boundaries.
- Improve workflow observability without exposing secrets or private project
  data.
- Prepare the repository, documentation, examples, and contribution workflow
  for a safe public release.

## Next

- Add first-class, named supervision profiles with explicit authority grants.
- Provide a small synthetic example project that demonstrates the complete
  EPIC -> FEAT -> delivery lifecycle.
- Make project onboarding and local prerequisites easier to validate.
- Expand evidence adapters for common test runners and build systems.
- Improve Git/worktree and pull-request hand-offs while retaining approval
  gates.
- Publish stable extension points for agents, workflows, and verification
  providers.

## Later

- Bounded delegated execution for complete features.
- Optional remote workers without moving product authority or secrets into an
  opaque service.
- Multi-user collaboration and organizational policies.
- Release and deployment workflows with explicit environment-specific grants.
- Comparable workflow benchmarks based on reproducible project evidence rather
  than estimated acceleration alone.

## Release milestones

### Public alpha

- Public-safe repository history and example data.
- Clear installation, security, and contribution documentation.
- Reproducible core workflow on a clean machine.
- Honest delivery evidence and no fabricated verification cases.

### Beta

- Stable project and workflow schemas with documented migrations.
- Named supervision profiles and authority records.
- Supported extension contracts.
- Multiple representative project types exercised end to end.

### 1.0

- Stable local-first product contract.
- Upgrade and recovery paths proven across releases.
- Security and governance model suitable for routine supervised use.
- Evidence-backed confidence in the full delivery lifecycle.
