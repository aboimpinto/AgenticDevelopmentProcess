# HEPHA Mission

## Purpose

HEPHA exists to make AI-assisted software delivery dependable, understandable,
and controllable by the people responsible for the product.

It is a local-first, human-supervised software factory that turns product
intent into auditable implementation. HEPHA uses agents to reduce repetitive
work and shorten feedback loops while preserving human authority over scope,
risk, acceptance, and consequential actions.

## Product promise

HEPHA should let a person answer four questions at any point in a delivery:

1. What are we building, and why?
2. What is the system doing now?
3. What evidence shows that the work is correct?
4. Which decisions or permissions still require a human?

If HEPHA cannot answer those questions from durable state and evidence, the
workflow is not complete.

## Principles

### Human authority is explicit

Humans own product intent and the decision to expand an agent's authority.
HEPHA may recommend, automate, and recover, but it must not silently convert a
suggestion into permission.

### Autonomy is scoped

Autonomy is useful when the objective, boundaries, tools, duration, and stop
conditions are understood. A broad or permanent autonomy grant is not a safe
default.

### Evidence outranks ceremony

An agent response, generated PDF, changed board state, or successful command
exit code is not proof on its own. Delivery status must be derived from valid
acceptance evidence.

### Product intent remains portable

EPICs, FEATs, decisions, and key delivery artifacts remain readable project
files. HEPHA-specific runtime state stays local and should be reconstructable
where practical.

### Work should become less ambiguous over time

The EPIC -> FEAT -> Phase -> Task hierarchy is not administrative decoration.
Each transition must narrow scope, expose dependencies, and produce work that
can be implemented and verified with less interpretation.

### Failure must be visible and recoverable

Stopped agents, zero-test runs, review findings, stale processes, and missing
evidence are workflow states to represent honestly. HEPHA preserves useful
work and gives the human a clear recovery choice.

## In scope

- Local project and MemoryBank registration.
- Product decomposition and clarification.
- Feature design, refinement, implementation, review, and verification.
- Durable agent runs, checkpoints, recovery, and observability.
- Model and specialist-agent routing by type of work.
- Acceptance-criterion coverage and delivery evidence.
- Git and worktree-aware development workflows.
- Human approvals and policy gates for consequential actions.

## Not yet

- A stable public API or extension ecosystem.
- A hosted multi-tenant service.
- A complete organizational permission model.
- Fully unattended production deployment.
- A guarantee that every project type can run without custom configuration.

## Non-goals

- Replacing product ownership or engineering judgment with model preference.
- Hiding uncertainty behind confident prose or generated artifacts.
- Letting an agent grant itself additional tools, scope, or authority.
- Making arbitrary background code changes outside an intentional workflow.
- Treating more tokens, more agents, or more automation as success by itself.
