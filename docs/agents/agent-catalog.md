# Agent Catalog

## Requirements Agent

Owns epic and feature capture, deep-dive interviews, ambiguity detection, and initial MemoryBank descriptions.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- EPIC card entering `Clarify`.
- EPIC card entering `Extract FEATs`.
- FEAT card entering `Clarify`.

Can emit one user question at a time.

## Feature Extraction Agent

Owns converting a clarified EPIC into a set of concrete FEATs with initial descriptions, dependencies, and suggested ordering.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- EPIC card entering `Extract FEATs`.

Can create:

- FEAT cards in `Submitted`.
- Initial `FeatureDescription.md` files.
- EPIC updates linking generated FEATs.

## Design Agent

Owns UX research, wireframes, interaction flows, and design summaries.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- FEAT card entering `Design`.

Only runs when the FEAT needs UI, UX, screen flow, or interaction design refinement.

## Refinement Agent

Owns implementation planning, phase breakdowns, task specs, Gherkin scenarios, and quality gate planning.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- FEAT card entering `Refine`.

## Implementation Agent

Owns code changes, local verification, commits, and phase task updates.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- FEAT card entering `Implementing`.
- FEAT card entering `Agent Fixing` when feedback does not require a stack-specific specialist.

## Test Agent

Owns test design, failing test analysis, regression checks, and quality gate evidence.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- Autonomous implementation pipeline.
- Verification feedback loop.

## Code Review Agent

Owns independent review against project guidelines, risk detection, and corrective recommendations.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- Autonomous implementation pipeline after implementation and tests pass.

## Documentation Agent

Owns lessons learned, completion reports, MemoryBank cleanup, and project knowledge updates.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- FEAT card entering `Done`.
- Completion of major implementation phases.

## Git Agent

Owns branch creation, worktree creation, repository cleanliness, commits, push preparation, and pull request preparation.

Model authority: this catalog assigns no default model. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Triggered by:

- FEAT card entering `Implementing`.
- Autonomous checkpoint commits.
- FEAT card entering `Done`.
- User requesting push or PR preparation.

Responsibilities:

- Create the implementation branch.
- Create a test worktree when the project policy asks for one.
- Keep the repository clean during long implementation runs.
- Create meaningful checkpoint commits.
- Detect unrelated user changes and avoid overwriting them.
- Prepare push/PR actions for approval.

Remote writes require user approval.

## Node/TypeScript Developer Agent

Owns implementation work in Node.js, TypeScript, React, Next.js, and related JavaScript ecosystems.

Model authority: this catalog assigns no default model or fallback. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Selected when project detection finds:

- `package.json`
- `tsconfig.json`
- `next.config.*`
- React/Vite/Node framework files

## C# Developer Agent

Owns implementation work in .NET and C# projects.

Model authority: this catalog assigns no default model or fallback. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Selected when project detection finds:

- `.sln`
- `.csproj`
- `Directory.Build.props`
- `global.json`

## Rust Developer Agent

Owns implementation work in Rust projects.

Model authority: this catalog assigns no default model or fallback. A registered Pi-worker action resolves through the persisted Action → Action Type → Global policy at dispatch.

Selected when project detection finds:

- `Cargo.toml`
- `Cargo.lock`
- `rust-toolchain.toml`

## Agent Selection Rules

The orchestrator should select stack-specific developer agents from project detection.

If a project contains multiple stacks, the orchestrator should either split work by touched area or ask the user which stack owns the FEAT.

The dashboard should allow manual agent override for exceptional cases.
