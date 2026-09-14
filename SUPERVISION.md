# Human Supervision in HEPHA

HEPHA is supervised by default. The human may deliberately delegate more of a
workflow, but reducing supervision must be a conscious, scoped, and recorded
decision.

## Current control model

The current product expresses supervision through workflow state rather than a
single autonomy switch:

- Moving an EPIC or FEAT into a trigger state authorizes that workflow step.
- Deep-Dive pauses for decisions that affect product intent or boundaries.
- Generated specifications and designs return to visible review states.
- Implementation begins only after an intentional Start Implementing action.
- Safety gates stop actions that exceed the current permissions or policy.
- Review and verification findings remain visible until evidence resolves them.
- Pushes, pull requests, releases, production changes, and broad destructive
  actions require explicit authority.

This approach lets routine work continue without asking for confirmation on
every command while keeping important decisions with the human.

## Planned supervision profiles

Named profiles will make the existing controls easier to understand and tune.
They describe intended operating policy; they are not all implemented as a
single selectable product setting yet.

| Profile | Agent may do | Human remains responsible for |
| --- | --- | --- |
| **Guided** | Analyze, propose plans, and prepare changes | Approving each implementation step and external action |
| **Supervised** (default) | Execute approved local workflows, test, review, and repair within scope | Product decisions, implementation start, acceptance, and consequential actions |
| **Delegated** | Complete a bounded feature through its configured gates | Defining the grant, handling escalations, and accepting delivery |
| **Autonomous** | Run a pre-authorized workflow until a stop condition | Explicitly enabling the grant, monitoring exceptions, and revoking authority |

## Requirements for an autonomy grant

A future Delegated or Autonomous grant should record at least:

- The EPIC, FEAT, phase, repository, or other exact scope.
- The actions and tools that are allowed.
- The actions that remain prohibited.
- Time, cost, token, or retry limits where applicable.
- Required quality and verification gates.
- Stop conditions and escalation routes.
- Whether commits, pushes, pull requests, releases, or deployments are allowed.
- Who granted the authority and when it expires.

HEPHA must reject authority inferred only from an agent request, a prior run, a
generic configuration default, or the absence of a human response.

## Repair work and escalation

The [common phase completion policy](docs/architecture/phase-completion-policy.md)
distinguishes an unresolved acceptance gate from a stopped workflow. Missing
tests, insufficient meaningful coverage, failed verification and review findings
remain same-phase repair work while an authorized path forward exists. They do
not require another user click merely because a gate is not yet green.

Regardless of profile, HEPHA should pause or fail visibly when:

- Product intent is ambiguous in a way that changes scope or behavior.
- The next action exceeds the recorded grant.
- A safety/security boundary or architectural impasse requires authority or a
  decision the worker does not have.
- Repeated attempts make no meaningful progress and diagnosis cannot establish
  an authorized path forward.
- Repository state makes the intended target uncertain.
- An operation could cause broad, irreversible, or external impact without
  explicit permission.

Before escalation, distinguish missing implementation, wrong assertions, missing
execution setup, evidence representation and architectural conflict. Preserve
completed work, report the attempts and unchanged evidence, and ask for the
specific help needed. Never disable a gate to escape an unresolved failure.
User cancellation remains effective. This is the agreed supervision policy;
legacy runtime stop paths still need conformance work where documented.

## Evidence and acceptance

Human supervision is not synonymous with manual testing. A backend-only feature
may be completely verifiable through automated evidence and legitimately have
no human-executable test case. Conversely, a user-facing workflow may require
concrete manual verification.

HEPHA should classify every acceptance criterion as Manual, Automated,
Deferred, or Uncovered. It must never manufacture manual steps merely to make a
delivery artifact look complete.

The human retains final acceptance authority unless a future, explicit grant
defines a narrower automated acceptance policy.
