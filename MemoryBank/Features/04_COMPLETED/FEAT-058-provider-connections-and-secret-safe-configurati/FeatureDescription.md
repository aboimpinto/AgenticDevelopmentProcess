# FEAT-058: Provider Connections And Secret-Safe Configuration

**Feature ID**: FEAT-058  
**Parent Epic**: EPIC-011  
**Status**: Completed  
**Priority**: P1  

## Summary

Establish the prerequisite foundation for provider connections and secret-safe configuration. This feature owns connection identity and configuration, endpoint validation, secure secret lifecycle management, deletion safeguards, and durable diagnostics without exposing secret values.

## Source

- EPIC: EPIC-011 - Model Catalog And Hierarchical Action Routing
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Users can create and manage provider connection identities with supported known-provider, custom-provider, and Pi Session configuration paths.
- Provider connection configuration supports the endpoint and non-secret settings required to validate a connection.
- The system validates configured provider endpoints and records durable diagnostic results suitable for later recovery and support workflows.
- Secrets can be created, rotated, revoked, and deleted through an explicit secure lifecycle.
- Secret values are masked in all user-facing views, diagnostics, logs, errors, and persisted connection contracts; secret material must not leak through normal application or orchestration outputs.
- Connection deletion is guarded so that dependent configuration or active usage is identified and requires an explicit safe resolution before removal.
- Provider connection contracts exposed to downstream features are sanitized and exclude secret values.
- The feature provides the connection and secret-safety foundation required by FEAT-059 for provider/model discovery.

## Scope And Boundaries

### In Scope

- Provider connection identity and configuration.
- Known-provider, custom-provider, and Pi Session connection types.
- Endpoint validation and durable connection diagnostics.
- Secure secret creation, rotation, revocation, and deletion.
- Secret masking and non-leak guarantees.
- Connection deletion guards and dependency-aware removal behavior.
- Sanitized connection contracts for downstream consumers.

### Out Of Scope

- Provider model discovery, synchronization, and catalog behavior, owned by FEAT-059.
- Broad dashboard models UX and recovery presentation, owned by FEAT-060.
- Model catalog management and hierarchical action-routing behavior beyond the secure connection contract.

## Dependency Contract

- FEAT-058 is the prerequisite provider-connection and secret-safety foundation.
- FEAT-059 must consume sanitized provider connection contracts when performing provider and model discovery.
- FEAT-060 owns dashboard presentation of recovery guidance and diagnostics; FEAT-058 provides durable diagnostic data rather than the broad recovery UX.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Deep-Dive recovery baseline | The current FeatureDescription is confirmed as the intended implementation scope for this in-progress feature. |
| Acceptance-criteria boundary | Implement the connection foundation and secure lifecycle: connection identity, known/custom/Pi Session configuration, endpoint validation, secret create/rotate/revoke/delete, masking and non-leak guarantees, deletion guards, and durable diagnostics. |
| Deferred scope | Defer model discovery and catalog behavior to FEAT-059 and broad Models UX to FEAT-060. |
| Generated scope validation | Keep FEAT-058 as the bounded prerequisite provider-connection and secret-safety foundation, with explicit sanitized-contract and dashboard-recovery ownership boundaries for FEAT-059 and FEAT-060. |

## Validation

- The scope is confirmed as the bounded provider-connection and secret-safety foundation for EPIC-011.
- Refinement must define the concrete provider connection schema, secret storage integration, validation failure taxonomy, diagnostic retention policy, and deletion dependency rules without expanding into FEAT-059 or FEAT-060 ownership.
