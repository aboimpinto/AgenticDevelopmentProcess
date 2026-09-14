## Project-owned verification commands

Policy version: project-test-plan-authoring/v1.

### Canonical location and ownership

Maintain one `## TestPlan` in `FeatureDescription.md`. Extend an existing test
manifest in place and link it from this heading; never create a competing list.
Each Phase has a `## Verification References` section containing stable check IDs
and criterion/task links into that TestPlan. FeatureTasks.md indexes those Phase
references. Shared project scripts/profiles may be linked, but each feature records
its exact selection and execution owner. Do not copy divergent command strings
into every task. Synchronize any existing machine execution contract with changes.

Refine-Feature supplies the initial declarations by reading current repository
configuration, without executing builds/tests or claiming validation. The Developer
Agent verifies and maintains them during authorized implementation: add, rename,
move or replace tests and update their check references in the same change. Phase
acceptance confirms required evidence and meaningful criterion coverage. Readiness
reads the maintained declarations rather than inventing a fresh project convention.
A read-only refresh reports a contract gap for authorized repair; it does not edit
project documents or waive a check. These authoring instructions do not add runtime
fields to an existing JSON exchange or grant snapshot-exclusion authority.

### Required TestPlan information for each check

Use a table or named check entries with these fields (an explicit empty list means
none; unknown is recorded as unresolved, never silently treated as none):

| Field | Required content |
| --- | --- |
| Check ID / kind | Stable ID; preparation, discovery, test, build, lint or review action. IDs never derive gate policy from a phase number. |
| Ownership / acceptance | Owning repository and Phase/Task references; covered Phase/FEAT/EPIC criterion IDs; test boundary. Preserve the independent needTestCoverage and needCodeReview declarations. |
| Command / working directory | Exact configured invocation and arguments; repository reference and cwd relative to that repository root. Record environment variable names and safe values or secret references, never credentials. Review actions can reference the configured review route instead of inventing a shell command. |
| Configuration evidence | Actual manifest, script, CI profile or runner path and relevant key/section supporting the command. Read wrappers and delegated commands, not just their names. |
| Test selection | Assembly/package/project, namespace or suite and file/test identity or filter. Identical display names in different assemblies or suites are valid. Discovery is not test execution. |
| Preparation / dependencies | Ordered prerequisite check IDs, fixtures/services, readiness checks, bounded timeout, cleanup owner and commands. Record serialization/resource locks or explicitly independent checks; no concurrent commands sharing an exclusive build directory. |
| Source inputs | Repository-relative source, test, configuration and lockfile inputs that affect this check, including delegated repository inputs. Explain the scope. |
| Generated outputs | Exact repository-relative generated files/directories, producing check ID and configuration evidence, plus downstream consumers. Never classify hand-authored source, tests or configuration as generated merely to silence freshness failures. Avoid blanket repository exclusions. |
| Evidence / success | Native report format/location, expected executed selection and outcome criteria. Zero selected tests, skipped required tests and discovery-only output cannot prove a test pass. Keep build/lint diagnostics advisory under the phase policy. |
| Validation / revisions | Initially UNVERIFIED (statically discovered); after execution record the actual outcome and report reference, or the exact unresolved cause. Record command changes with old/new declaration, reason and affected evidence. runId and timestamps are optional audit metadata. |

### Different projects and multiple stacks

Resolve commands per owning repository and check, not from one feature-wide language
label. Inspect manifests, lockfiles, scripts, CI workflows and fixture code. A mixed
feature may have distinct backend, native and frontend checks and preparation.
.NET/C# projects may configure dotnet test for particular projects/assemblies and
filters with native reports; Rust projects may configure Cargo manifests, workspace
packages, features and serialization; Next.js projects may define different package
scripts for web/static builds and browser fixtures. These are discovery examples,
not default commands. Other languages, custom wrappers and review routes are equally
valid. Never choose npm, dotnet, Cargo, ports, output paths or services from the
framework name alone. Follow the repository's actual package manager and scripts.

### Maintenance and execution discipline

Inspect and resolve missing commands from current configuration before asking the
user. If no executable route exists, record the exact gap and owning repair task;
never run a placeholder, claim an unverified command passed, or drop its obligation.
Escalate only an actual unresolved architecture, intent or authority decision.

Describe preparation before dependent verification, including commands that build
internally and regenerate tracked files. Declare those outputs before execution;
do not expand exclusions after observing a mismatch. A correct executor must account
for declared generation separately from changed source inputs. If the current
executor cannot represent those semantics, report that capability gap explicitly;
do not disable freshness checks, alter receipts or claim the declarations already
change engine behavior. Retain valid partial results and rerun affected verification
when relevant inputs change. Update the TestPlan and Phase references before the
next acceptance attempt, within the current action's documentation authority.
