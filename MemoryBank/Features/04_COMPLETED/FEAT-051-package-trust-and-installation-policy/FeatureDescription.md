# FEAT-051: Package Trust And Installation Policy

**Feature ID**: FEAT-051  
**Parent Epic**: EPIC-009  
**Status**: Completed

## Summary

Define the enforced policy foundation required before companion-package capabilities can be exposed: trusted package records with pinned versions, explicit approval checks for extension capabilities, revocation handling, and durable version evidence in run receipts and dashboard traces.

This FEAT covers trust decisions, version pinning, approval and revocation policy, and audit evidence. Package installation execution is explicitly deferred.

## Source

- EPIC: EPIC-009 - Pi Skills And Extensions Integration
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Trusted-package records support an explicitly pinned package version.
- Policy checks require explicit approval before a package can expose new extension capabilities.
- Revoked packages or package versions are prevented from being treated as trusted or approved.
- Run receipts record the installed package version for companion-package capabilities used during the run.
- Dashboard traces expose package-version evidence sufficient to review package trust and capability decisions.
- Focused automated tests cover trusted-version evaluation, capability approval checks, revocation handling, and receipt and trace evidence.
- Package installation execution is not implemented as part of this FEAT.

## Validation

- The feature scope is limited to policy and audit foundations required before companion packages are exposed.
- Installation, download, and package-execution workflows are deferred to a separate feature.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Policy slice | Deliver the enforced policy foundation: pinned trusted-package records, capability approval checks, revocation handling, receipt and trace version evidence, and focused tests. |
| Scope boundary | Limit the FEAT to trust decisions, version pinning, approval and revocation policy, and durable receipt/dashboard trace evidence. Defer package installation execution. |
