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

Use Linux or WSL with Node.js 24, pnpm 11, and Git.

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

## Pull requests

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
