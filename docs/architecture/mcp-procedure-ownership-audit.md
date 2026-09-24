# MCP procedure ownership audit

This audit covers Deep-Dive, Refine Feature, Start Feature and Continue
Implementing when the selected recipe source is `devcycle-mcp`.

| Call | Procedure authority | HEPHA supplies and enforces |
| --- | --- | --- |
| Deep-Dive | DevCycle `deep-dive`, `response_mode=host_stage`, one of opening/follow_up/clarify/apply_answers | Target locator, one context snapshot, saved answers, model routing, UI persistence, result validation and source write |
| Refine Feature | Returned `refine-feature` recipe and its shared MCP policies | Exact tool arguments, current artifact diagnostics, resolved target decisions and provider artifact admission |
| Start Feature | Returned `start-feature` recipe, including its continuation handoff | Authorized single-phase session, phase/evidence locations, lifecycle validation and the outer autonomous loop |
| Continue Implementing | Returned `continue-implementation` recipe and shared phase-gate policy/schema | The same session boundary, host execution observations, independent evidence validation and authorized continuation |

## Removed duplication

PR #51 removed native verification, acceptance, TestPlan, manual-test and gate
schema copies from MCP launch prompts. MCP workers also disable native skill and
prompt-template discovery: those could advertise a second workflow procedure.
Native workflow execution keeps its own skills and policies when explicitly
selected.

Deep-Dive previously never called MCP. Its opening, follow-up, clarification and
rewrite procedures now come from dedicated hosted-stage recipes. HEPHA fetches
the selected procedure directly through DevCycle's stateless JSON-RPC HTTP
endpoint before invoking Pi. It consumes only `structuredContent`; it does not
append the duplicate MCP text representation. No extra model call is needed to
fetch the recipe. Source documents and answers stay in the Pi input; MCP receives
only the target locator and stage.

The current primary document appears once. Preparation documents exclude that target.
A follow-up references its newest answer by ID in the saved transcript rather
than repeating the answer, and includes current design/preparation context.
Clarification receives all saved answers and identifies the active question by ID.
The host adds no native interview policy to an MCP
stage. The selected procedure contains the stage's question/result format.

## Host responsibilities remain

HEPHA stores questions and answers and applies versioned exact text edits to the
current primary snapshot. The `deep-dive.edits` exchange rejects partial Markdown,
truncated JSON, ambiguous/missing anchors, overlapping edits and whole-document
replacement. Untouched text survives, and source changes during model execution
prevent the write. The MCP schema and host decoder share the same versioned
exchange contract. All hosted Deep-Dive model calls
run without file/shell tools, context-file discovery, skills or templates. An
inactive session after recipe retrieval cannot start the model. Missing recipes,
wrong target/stage/version/output contracts, mutation scope and invalid question
responses fail visibly. Only explicit valid empty follow-up questions close a
branch. MCP document-update failure never invokes the native deterministic
rewrite fallback, including the native large-document threshold. HTTP responses
are limited to two megabytes during streaming, with oversized streams cancelled.

Host-directed gate repair remains a separate recovery action which does not
fetch an MCP recipe. It receives the host's local gate exchange contract once;
it is not a second policy layer appended to an MCP recipe session. Deterministic
phase admission, cancellation, manual receipt validation and lifecycle recovery
remain HEPHA responsibilities.

This change does not resolve the separate Pi/HEPHA token-budget guard conflict,
alter configured acceptance criteria, or establish live-model completion.

## Configuration and deployment order

`HEPHA_DEEP_DIVE_RECIPE_SOURCE` overrides `HEPHA_FEATURE_RECIPE_SOURCE` for both
EPIC and FEAT interviews. With neither configured, native HEPHA remains the
default. MCP Deep-Dive uses `HEPHA_DEV_CYCLE_MCP_CONFIG_PATH` and the exact
`devcycle-mcp` server entry with an HTTP(S) `url` and optional literal headers.
It does not require the Pi MCP extension; feature implementation workers do.
Redirects and credential-bearing URLs are rejected; configured headers carry
authentication without being written to errors.

Deploy a DevCycle build advertising `devcycle-deep-dive-host/v1` before restarting
HEPHA with MCP Deep-Dive selected. Older recipe responses fail the version/scope
check rather than silently selecting a native procedure. The maintainer controls
running server/container replacement.

## Evidence

`deep-dive-mcp-procedure.integration.test.ts` exercises all four planners through
the HTTP client contract and independent provider response fixtures. It verifies
context uniqueness, tool isolation, UI normalization, invalid contracts, malformed
follow-ups, explicit closure and cancellation while fetching a recipe. These are
deterministic contract tests; no paid model is called. Existing native Deep-Dive,
MCP feature lifecycle and phase-gate tests remain applicable.
