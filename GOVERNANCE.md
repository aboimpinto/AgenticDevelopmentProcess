# HEPHA Governance

HEPHA is currently maintained by Paulo Aboim Pinto. The project uses a
maintainer-led model designed for a small human-and-agent team while remaining
open to outside contribution.

## Decision authority

The maintainer has final responsibility for:

- Product direction and scope.
- Changes to supervision, safety, evidence, and authority boundaries.
- Merge, release, and repository administration decisions.
- Security response and disclosure timing.
- Appointing additional maintainers.

Agents may analyze, implement, test, and review changes within an authorized
scope. They do not acquire maintainer authority and cannot approve their own
expansion of permissions.

## Contribution decisions

Issues and pull requests are evaluated against:

1. `MISSION.md` and its non-goals.
2. `SUPERVISION.md` and the human-authority contract.
3. Existing architecture and workflow invariants.
4. Reproducible implementation and verification evidence.
5. Security, maintenance, and compatibility impact.

The maintainer may accept, request changes, defer, redirect, or decline a
proposal. A technically sound change may still be deferred when it expands the
product beyond the current roadmap or creates maintenance obligations the
project cannot yet support.

## Merge model

Changes normally enter `master` through a focused pull request. A merge requires:

- Clear intent and bounded scope.
- Required CI checks passing.
- Acceptance evidence that distinguishes passed, failed, zero-test, and
  not-executed outcomes.
- Resolution of blocking review findings.
- No unresolved secret, privacy, licensing, or destructive-migration concern.
- A conscious maintainer merge decision.

An independent agent or model review can strengthen the evidence, but it does
not replace maintainer authority. The project does not require a second human
reviewer while it has only one human maintainer.

Squash merge is preferred so each pull request becomes one understandable
change on `master`.

## AI-assisted contributions

AI assistance is welcome. Pull requests should disclose material agent use and
identify which evidence was observed rather than merely reporting that an agent
said the work was complete. The human submitting a contribution remains
responsible for its content and licensing.

## Becoming a maintainer

Additional maintainers may be invited after sustained, constructive
contribution and demonstrated care for HEPHA's supervision, safety, and
evidence contracts. Repository permissions are granted explicitly and can be
limited by role or area.

## Governance changes

Changes to this document use the normal pull-request process but require an
explicit maintainer decision. An implementation agent must not weaken
governance or safety controls as part of an unrelated feature.
