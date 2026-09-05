# FEAT-059: Pi And OpenAI-Compatible Model Discovery Catalog

**Feature ID**: FEAT-059  
**Parent Epic**: EPIC-011  
**Status**: Completed  
**Priority**: P1  

## Summary

Create a read-only, deterministic model discovery catalog that discovers models available through Pi and OpenAI-compatible connections, normalizes them into one internal catalog, and exposes discovery diagnostics.

## Source

- EPIC: EPIC-011 - Model Catalog And Hierarchical Action Routing
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Discover models from Pi and OpenAI-compatible providers using connection records supplied by FEAT-058.
- Implement a narrowly scoped, server-side scan-only credential broker over FEAT-058 vault access for authenticated provider scans when required. The broker may read a configured secret solely to authorize an outbound catalog request.
- Ensure FEAT-059 receives and stores only normalized model results and safe diagnostics; secrets must not reach catalog storage, APIs, logs, prompts, or discovery adapters.
- Normalize discovered provider model data into a single deterministic internal catalog contract.
- Produce stable catalog results for equivalent connection inputs, including consistent identifiers, provider metadata, and model capability information when available.
- Surface diagnostics for discovery outcomes, including successful discovery, unavailable providers, malformed responses, authentication-safe failures, and normalization failures.
- Treat the catalog as read-only; it must not modify connection records, vault records, or provider configuration.
- Add focused tests for Pi discovery, OpenAI-compatible discovery, authenticated discovery through the scan-only credential broker, deterministic normalization, and diagnostics.
- Add public-boundary tests covering catalog behavior exposed to its consumers, including confirmation that secrets are never exposed.
- Permit changes to the internal catalog contract where required by the normalized discovery design.

## Dependencies

- FEAT-058

## Scope And Boundaries

- Use FEAT-058 connection records as the sole catalog discovery input.
- Include Pi and OpenAI-compatible model discovery only.
- FEAT-059 owns the minimum scan-only credential broker over FEAT-058 vault access required for authenticated discovery.
- The credential broker may read a provider secret only to authorize one outbound provider catalog request.
- Keep secret retrieval outside catalog storage and provider discovery adapters; FEAT-059 catalog consumers receive normalized results and safe diagnostics only.
- Do not retain, return, log, prompt with, or otherwise expose provider secrets.
- FEAT-062 remains responsible for worker-process credential injection and runtime evidence, not discovery credential brokering.
- Defer action routing, UI policy, and legacy configuration migration to later work.
- Do not introduce runtime mutation of connection records, vault records, or provider configuration.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Catalog capability | Deliver a read-only catalog with deterministic normalization, discovery diagnostics, focused tests, and public-boundary tests. |
| Compatibility boundary | Use the current internal contract and FEAT-058 connections only; breaking internal catalog contract changes are permitted. |
| Authenticated discovery broker ownership | FEAT-059 owns the minimum scan-only server-side credential broker over FEAT-058 vault access, avoiding a dependency cycle with FEAT-062. |
| Authenticated discovery boundary | The broker may read a provider secret only to authorize an outbound discovery request. FEAT-059 receives normalized results and safe diagnostics only; secrets must not enter catalog storage, APIs, logs, prompts, or discovery adapters. |
| FEAT-062 boundary | FEAT-062 remains responsible for worker-process credential injection and runtime evidence. |
| Deferred work | Routing, UI policy, and legacy configuration migration remain out of scope. |

## Validation

- Refine the normalized catalog contract, diagnostic shape, provider-specific discovery adapters, scan-only credential-broker interface, and FEAT-058 vault-access boundary during feature refinement and design.
