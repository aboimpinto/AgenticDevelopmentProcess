# Contributing to HEPHA

HEPHA is an early-stage project and welcomes focused contributions, design
discussion, reproducible bug reports, and real workflow case studies.

## Before opening an issue

- Search existing issues and discussions.
- Describe the project shape and the HEPHA workflow state where the problem
  occurred.
- Include the expected behavior, observed behavior, and a minimal reproduction.
- Remove API keys, credentials, personal paths, private source code, customer
  data, raw agent transcripts, and unredacted screenshots.
- For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
  opening a public issue.

## Local setup

Use Linux or WSL with Node.js 24.15.0 or later on the Node 24 LTS line, pnpm 11,
and Git. jsdom 30 requires this patch-level minimum; Node 25 is unsupported.

```bash
git clone https://github.com/aboimpinto/AgenticDevelopmentProcess.git
cd AgenticDevelopmentProcess
pnpm install
cp .env.example .env
```

Start the local applications when needed:

```bash
pnpm dev:all
```

The dashboard is served at <http://127.0.0.1:5173> and the orchestrator at
<http://127.0.0.1:4317>.

## Making a change

1. Create a focused branch from `master`.
2. Keep the change within one clear problem or feature.
3. Add or update tests for changed behavior.
4. Update user-facing and architectural documentation when contracts change.
5. Run the relevant verification before opening a pull request.

```bash
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm test:e2e` for affected end-to-end journeys when the local test
environment is available.

## Dependency updates

Keep `@types/node` on the Node 24 line used by the minimum supported runtime and
CI. Newer major declarations can make unavailable runtime APIs typecheck.
The web coverage job tests Node 24.15.0 to keep the jsdom runtime floor verified;
the other CI jobs follow the latest Node 24 release.
Dependabot excludes Node type versions 25 and above until the runtime baseline
is deliberately raised; update that ceiling with the engines and CI version.

Update tightly coupled packages together: React and React DOM with their type
packages, Vitest with its coverage provider, and Prisma client with its adapter.
Dependabot groups these families so one PR can validate the complete combination.

HEPHA uses TypeScript 7's native `tsc` through the `@typescript/native` npm alias.
The `typescript` dependency is an alias for the official
`@typescript/typescript6` compatibility package because source inspection and
architecture tests use the JavaScript compiler API. TypeScript 7 does not expose
that API. Keep compilation and programmatic inspection separate when updating
these packages; do not replace the compatibility alias with an ordinary major
version bump. See [TypeScript's side-by-side migration guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).

Run typecheck, core tests, build, web coverage/quality checks and the affected
browser journeys for dependency upgrades. A React runtime upgrade requires the
full dashboard browser suite. Keep frozen-lockfile installation working in CI.

## Mermaid diagrams

HEPHA uses Mermaid 12's ELK layout and neo look with the dashboard's dark theme.
Diagram geometry can change from version 11; use the normal Mermaid syntax and
review the rendered result instead of relying on fixed positions or old SVG
structure. Modern browser support follows Mermaid 12: ES2024 and Safari 17.4+.
The Chromium journeys exercise real flowchart, sequence, state and class diagrams,
as well as malformed-source recovery.

Mermaid 12 includes a lazy ELK engine chunk of about 1.46 MB minified. It exceeds
the existing 700 kB build warning threshold, so the build reports that warning.
Keep the warning visible and the threshold unchanged. Production-bundle tests
verify that neither Mermaid nor ELK enters the initial dashboard module graph;
the engine is downloaded when a diagram needs it. See the
[Mermaid 12 release notes](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0).

## Pull requests

Follow the [Greptile PR review procedure](docs/contributing/pr-review.md) after
opening or updating a PR. Wait for review of the current head, address findings
with evidence, and recheck after fixes before merging.

A useful pull request explains:

- The problem and user impact.
- The chosen behavior and important trade-offs.
- How it was verified.
- Any migration, compatibility, security, or workflow-state impact.
- Screenshots for visible dashboard changes.

Do not commit `.env` files, local SQLite databases, generated logs, coverage
reports, raw agent sessions, or project-specific private MemoryBanks.

By contributing, you agree that your contribution is licensed under the MIT
License used by this repository.
