# FEAT-061: Agent Registry, Hierarchical Routing Policy, And Deterministic Resolver

**Feature ID**: FEAT-061
**Parent Epic**: EPIC-011
**Status**: Completed
**Priority**: P1

## Summary

Deliver the agent registry, hierarchical routing policy, and deterministic resolver as Hepha’s sole routing authority. The feature produces typed, deterministic route and handoff plans for execution, while runtime worker spawning and execution remain outside this scope.

## Source

- EPIC: EPIC-011 - Model Catalog And Hierarchical Action Routing
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Scope And Ownership

FEAT-061 owns:

- Agent registry bootstrap, configuration, and policy UI/API.
- Hierarchical policy precedence and deterministic route resolution.
- Capability validation and routing-loop prevention.
- Typed resolved-route and handoff-plan contracts.
- Migration of production callers and fixtures away from static model-routing fields.
- Removal of legacy routing fallback paths.

FEAT-062 owns:

- Pi worker spawning and worker injection.
- Secret injection.
- Runtime receipts.
- Actual handoff execution.

## Hepha Deep-Dive Decisions

- FEAT-061 owns the resolver contract and dispatch-plan boundary; it does not execute worker handoffs.
- The registry and resolver replace static model-routing inputs as the sole routing authority.
- Production callers and fixtures must use the typed resolved-route contract.
- Legacy static routing fields and fallback behavior are not permitted after migration.
- FEAT-062 consumes the resolved-route contract to perform Pi spawning, secret injection, receipt handling, and actual handoff execution.

## Acceptance Criteria

- An agent registry can be bootstrapped and managed through supported policy UI/API surfaces.
- Routing policy supports defined hierarchical precedence and resolves a route deterministically for identical valid inputs.
- The resolver validates agent capabilities before returning a route or handoff plan.
- The resolver detects and rejects routing loops or invalid handoff chains with actionable deterministic errors.
- The resolver returns a typed resolved-route contract containing the selected agent, applicable policy decisions, and ordered handoff or dispatch plan required by FEAT-062.
- Production routing callers and test fixtures are migrated from static model-routing fields to the registry and resolver contract.
- No legacy static routing fallback remains available in production resolution paths.
- Resolver behavior is covered by tests for precedence, deterministic resolution, capability validation, loop prevention, invalid configuration, and typed contract output.
- The feature does not spawn Pi workers, inject secrets, record runtime receipts, or execute handoffs.

## Dependencies

- FEAT-059

## Validation

- Confirm registry bootstrap, policy precedence, capability validation, loop prevention, and deterministic resolved-route output through automated tests.
- Verify migrated production callers and fixtures cannot resolve routes through legacy static model-routing fields.
- Verify FEAT-062 can consume the typed resolved-route contract without requiring FEAT-061 to perform runtime execution.
