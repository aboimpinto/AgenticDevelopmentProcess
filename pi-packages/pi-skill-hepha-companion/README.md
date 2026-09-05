# @aboimpinto/pi-skill-hepha-companion

Companion package for the Hepha workflow orchestrator — approved stable skills for
Pi Coding Agent integration.

> **⚠️ Authority Notice**
>
> This package is a distribution boundary, not a workflow engine. Installing or updating
> this package does **not** grant workflow-state authority, SQLite access, board
> transition capability, approval resolution, profile escalation, or direct receipt
> persistence. All operations remain routed through the Hepha orchestrator's mediated
> interfaces (FEAT-049) and are subject to the package trust policy (FEAT-051).
>
> Installation is not activation; the orchestrator remains the sole state and safety
> authority.

## Contents

### Skills

| Skill | Version | Source | Authority |
|-------|---------|--------|-----------|
| `serialized-build-commands` | 0.1.0 | FEAT-029 (existing stable skill) | Declares minimum tool profile; orchestrator validates and routes shell access through declared command templates. No SQLite/state/board/approval handles. |
| `continue-implementation` | 0.1.0 | Existing Hepha skill package | Declares minimum tool profile; orchestrator validates read/write/gate contracts before execution. No direct state or persistence access. |

### Extensions

The `extensions/` directory is reserved for future use when the Pi extension host
format stabilizes. No extensions are currently included.

### Explicitly Excluded

The following components are **not** included pending explicit recorded human approval:

- `review-phase` (FEAT-048 pilot)
- `repair-review-findings` (FEAT-048 pilot)
- Any FEAT-052 components (FEAT not yet completed)

---

## Installation

### Prerequisites

- [Pi Coding Agent](https://github.com/earendil-works/pi) installed and authenticated
- Hepha project checkout at the workspace root
- `master` or `main` branch (non-detached)

### Install from local checkout

```bash
# From the HEPHA repository root:
pi install ./pi-packages/pi-skill-hepha-companion
```

### Verify installation

```bash
pi package list       # Should list @aboimpinto/pi-skill-hepha-companion
pi skill list         # Should list serialized-build-commands and continue-implementation
```

### Update

```bash
# Reinstall from updated source:
pi install ./AgenticDevelopmentProcess/pi-packages/pi-skill-hepha-companion --force
```

### Rollback

```bash
# Revert to previous package version via git:
git checkout HEAD~1 -- AgenticDevelopmentProcess/pi-packages/pi-skill-hepha-companion/
pi install ./AgenticDevelopmentProcess/pi-packages/pi-skill-hepha-companion --force
```

### Revocation

If a package version is revoked (per FEAT-051 trust policy):

1. Remove the revoked package directory locally.
2. Reinstall from an approved version.
3. The revocation is recorded in the FEAT-051 `PackageRevocationRecord`.

---

## Usage

### Serialized Build Commands

Before running any build, test, lint, or format command that uses shared caches
or locks (especially Rust Cargo):
```bash
pi --approve "Use the serialized-build-commands skill before running cargo check."
```

### Continue Implementation

Resume an autonomous HEPHA FEAT implementation:
```bash
pi --approve "Use the continue-implementation skill for HEPHA FEAT-XXX autonomous."
```

---

## Trust And Safety

- All included components have passed Hepha completion gates, code reviews, and quality checks.
- Component admission follows the documented schema in `Phases/planning-analysis-report.md` (FEAT-050 planning analysis).
- Package trust decisions follow FEAT-051 policy: pinned versions, explicit approval references, and revocation records.
- Extension operations route through the FEAT-049 orchestrator mediator — no direct state access.
- Test files validate that the package cannot grant workflow-state authority.

---

## Development

### Adding a new component

1. Ensure the component satisfies the admission schema (see `Phases/planning-analysis-report.md` Section 2).
2. Obtain recorded human approval if the component is a pilot.
3. Add the component directory under `skills/` or `extensions/`.
4. Update `package.json` if needed.
5. Update this README with the new component entry.
6. Run verification tests.

### Release

1. Bump version in `package.json` per semver.
2. Commit changes to the FEAT-050 branch.
3. Merge to `master`.

---

## License

MIT — see LICENSE file.
