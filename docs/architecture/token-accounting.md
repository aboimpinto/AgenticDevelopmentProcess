# Token accounting

Context occupancy and spending are separate controls. Never equate KB, UTF-8
bytes, characters, or cumulative lifetime usage with model context tokens.

For each pinned readiness route, HEPHA obtains context/output limits from the
current local Pi SDK snapshot and uses a local text tokenizer. It reserves the actual task output
allowance (up to 16,384 tokens on supported transports) and 4,096 framing tokens. Light compaction starts
at 50% of remaining input capacity; strong compaction starts at 80%, targeting
75% after strong compaction; 75% is not an admission ceiling below the 80% trigger.
Planning also reserves 2,048 tokens for the provider wrapper. Every complete
provider payload is checked again with the effective model and bound output cap.
Approved smaller fallback routes must fit too. Unknown capacity/tokenizer support
stops before dispatch rather than inventing a byte conversion.

The former hidden 512,000-token spending ceilings are replaced by optional,
operator-owned `HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS` (one worker attempt) and
`HEPHA_READINESS_MAX_INPUT_TOKENS` (one readiness assessment session).
Unset/empty means no cumulative cap; a configured value must be a positive
integer. Context capacity, progressive compaction, runtime/stall guards and
bounded assessment operations remain independent and active. Counts include
repeated history and are local input estimates, not billed tokens or a monetary
budget. These settings do not aggregate all workers into one feature-wide cost
limit. Operators who require a spending stop should configure an explicit cap.
Exceeding it reports consumed/next/limit and stops before dispatch, without
fallback or automatic retry. Request telemetry remains in logs, not the card.
Budget-stopped fresh inspections retain their worker sessions and any bounded
partial scope checkpoint already published. A later explicit Refresh uses that
checkpoint only as navigation after source/identity validation, re-reads current
test/configuration sources including linked repositories, and requires a complete
plan before running tests. Changed or malformed checkpoints are not reused.
If the worker stopped before publishing a checkpoint, inspection starts afresh.
No partial checkpoint certifies coverage or test execution.
Artifact constraints, such as a 12,000-byte source-fact JSON limit, remain schema
constraints and cannot trigger a model-window percentage by themselves.

## Capacity discovery and execution timing

HEPHA reads exact numeric capacities using `ModelRuntime` from the installed Pi
SDK, including its configured model overrides, with `allowModelNetwork: false`.
Only allowlisted model metadata leaves that bounded subprocess. Provider identity
is filtered before normalization; identical model names on different providers
must not share limits. The CLI's human table is not authoritative: 1,050,000 can
display as `1.1M`. Unsupported SDKs fail discovery rather than guessing a capacity.

Published model capacity, Pi's configured effective capacity, a pricing threshold,
and HEPHA's cumulative spending ceiling are different quantities. For example,
[OpenAI documents Astra's 1,050,000-token context](https://developers.openai.com/api/docs/models/gpt-6-astra),
while Pi's September 2026 catalogue supplies a 272,000-token default. Pi documents
[model overrides and short-context pricing defaults](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md).
An approved Pi override must be shared by discovery and execution; HEPHA must not
silently inflate only its planner or modify global configuration. Refresh the
catalogue after changing overrides to update its display. Readiness reads effective
SDK limits independently once per refresh, before any compaction decision; it does
not require that manual scan or reuse stale display limits. Missing live metadata
fails closed. No override or extension is installed by either lookup or scan.

Native Pi compaction is checked after an agent run. HEPHA's request guard is a
separate pre-provider-call admission check, not an extension that aborts/resumes
tool loops or silently summarizes unique evidence. Do not install competing
context managers as a substitute for request accounting.

Readiness assessments retain a resettable 120-second idle watchdog, token spending
ceilings and bounded checkpoint/assessment operations, but no five-minute absolute
deadline. Observable activity is liveness, not proof of useful progress or a pass.
This is not a total output-cost guarantee; provider reasoning can continue while
active. Manual-test authoring keeps its previous deadline.

## Transport-specific output limits

The [public Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
documents `max_output_tokens`. That does not establish support on the separate
Codex subscription transport. The installed Pi Codex adapter omits this field,
and the observed live rejection confirmed that injecting it is unsupported.
HEPHA now removes output-limit fields on `openai-codex-responses`; it does not
substitute a different unsupported parameter. Public Responses/Completions retain
their supported fields. No provider request is retried just to probe capabilities.

Readiness obtains the effective provider through the same connection resolver as
execution, not model names or display labels. On Codex, both planner and wire
guard reserve the catalogue maximum output because a smaller task limit cannot
be enforced. This can cause earlier compaction than a transport with an enforced
16,384-token cap; the token-window denominator is honest in both cases. Approved
fallback routes are included in this planning, without changing route selection.

## Local tokenizer support

- `gpt-tokenizer` 4.0.0 supplies `cl100k_base` for older GPT-3.5/GPT-4 and
  `o200k_base` for modern GPT/o-series text. These are family-compatible local
  encodings, not a claim of exact server-side encoding for every future model.
  [Tokenizer documentation](https://github.com/niieani/gpt-tokenizer).
- Pinned/self-hosted DeepSeek V4 Flash and current V4 Pro use the V4 tokenizer through
  `@huggingface/tokenizers` 0.2.0. HEPHA caches only public tokenizer metadata,
  fetched lazily when that model is selected. No prompt or client source is sent
  to the tokenizer host. The pinned
  [official tokenizer revision](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash/tree/60d8d70770c6776ff598c94bb586a859a38244f1)
  is checksum-verified before use. The official Flash API aliases now use the
  separate V4.1 assets described below.
  `HEPHA_TOKENIZER_CACHE_DIR` can select a pre-provisioned local cache for offline use.

Local counts tokenize complete serialized text requests, including their textual
wire overhead. Provider chat framing, reasoning and multimodal accounting can
differ. The framing margin is conservative, not a mathematical guarantee for all
multimodal adapters. Provider-reported usage remains a separate log record; local
counts must never be presented as billed usage. Byte counts are diagnostic only.

The feature shows compaction activity and completed token counts, never approval.
Old saved byte-only metrics are hidden, not converted or relabelled. No feature
IDs, test filenames, client language, or domain requirements influence thresholds.

## Verified model identities and tokenizer preparation

The model catalogue advertises availability; it does not prove HEPHA can tokenize
that model. The generic Pi launcher resolves tokenizer support before spawning a
worker. Unsupported identities produce a diagnostic naming the provider/model,
without executing tools or sending a model request. The request guard prepares
pinned assets using the same resolver; it must not select preparation via a second
model-name substring test. Readiness supplies provider identity to that resolver.

As verified against [DeepSeek's current API documentation](https://api-docs.deepseek.com/quick_start/pricing/)
on 2026-09-13, `deepseek-flash` identifies V4.1 Flash. On the official DeepSeek API,
`deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` also route to V4.1.
Versioned V4 on other providers/self-hosted deployments and the current V4 Pro API
retain their V4 tokenizer; a moving alias on an unknown provider is not inferred.
Future alias changes require verification, not date-based prediction.

V4.1 uses the official `deepseek-ai/DeepSeek-V4.1-Flash` tokenizer pinned to
revision `dba1be0a40aa45a94ad051997016db3960a90277`. Its tokenizer.json SHA-256 is
`c90dfa01249db1be4245780a052ede752e1361c612ac6d08e2bdada7d599476b`;
tokenizer_config.json SHA-256 is
`6ac8c8dc065ed118161d02dd532749ae3f52c243deac27872134fae2f50d8547`.
The V4.1 tokenizer differs from V4; sharing V4's counter would be incorrect.
Each pinned revision has its own cache subdirectory under the default tokenizer
cache root or HEPHA_TOKENIZER_CACHE_DIR. Downloads carry no project data and are
checksum-verified before use. Unsupported or corrupt assets never fall back to
character/byte estimates. These are text-token budget counts, not provider billing
or vision-token counts.
