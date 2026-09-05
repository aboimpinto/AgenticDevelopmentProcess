import type { GovernanceDashboardReadV1 } from "./read-contracts.js";

export type GovernanceActionKindV1 = "SCOPE_EXPANSION_DECISION" | "REPLAN_DECISION" | "DEBT_TRIAGE" | "FUTURE_TOUCH_DECISION" | "PILOT_ADMISSION" | "PILOT_DISABLEMENT";
type GovernanceActionEnvelopeV1 = Readonly<{
  schemaVersion: "hepha-governance-action/v1"; actionId: string; expectedVersion: number; reason: string;
  confirmation: Readonly<{ statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION"; actionDigest: string }>;
}>;
type GovernanceActionRequestScopeV1 = GovernanceActionEnvelopeV1 & Readonly<{ kind: "SCOPE_EXPANSION_DECISION"; action: "ACCEPT_SCOPE_EXPANSION" | "REJECT_SCOPE_EXPANSION"; target: Readonly<{ aggregateId: string; featureId: string; phaseNumber: number; reviewGateId: string; defectClass: string; findingObservationId: string }>; payload: Readonly<Record<never, never>> }>;
type GovernanceActionRequestReplanV1 = GovernanceActionEnvelopeV1 & Readonly<{ kind: "REPLAN_DECISION"; action: "APPROVE_REPLAN" | "REJECT_REPLAN"; target: Readonly<{ aggregateId: string; featureId: string; phaseNumber: number; reviewGateId: string; defectClass: string; requestId: string; planHash: string; planVersion: number }>; payload: Readonly<Record<never, never>> }>;
type GovernanceActionRequestDebtV1 = GovernanceActionEnvelopeV1 & Readonly<{ kind: "DEBT_TRIAGE"; action: "CONFIRM" | "REJECT" | "MERGE" | "REASSIGN" | "DEFER" | "ACCEPT_RISK" | "PLAN_LINK" | "CLOSE" | "SUPERSEDE"; target: Readonly<{ recordId: string }>; payload: Readonly<Record<string, unknown>> }>;
type GovernanceActionRequestFutureTouchV1 = GovernanceActionEnvelopeV1 & Readonly<{ kind: "FUTURE_TOUCH_DECISION"; action: "REMEDIATE" | "PREREQUISITE" | "WAIVER" | "NON_INTERACTION"; target: Readonly<{ recordId: string; featureId: string; touchPlanHash: string; selectorIds: readonly string[] }>; payload: Readonly<Record<string, unknown>> }>;
type GovernanceActionRequestPilotAdmissionV1 = GovernanceActionEnvelopeV1 & Readonly<{ kind: "PILOT_ADMISSION"; action: "APPROVE_PILOT"; target: Readonly<{ pilotId: string; featureId: string; phaseContractId: string; taskId: string; contractVersion: number; pilotConfigHash: string }>; payload: Readonly<{ parityReceiptId: string; migrationAuditId: string; expiresAt: string }> }>;
type GovernanceActionRequestPilotDisablementV1 = GovernanceActionEnvelopeV1 & Readonly<{ kind: "PILOT_DISABLEMENT"; action: "DISABLE_PILOT"; target: Readonly<{ pilotId: string }>; payload: Readonly<{ disableReason: string }> }>;
/** Closed V1 action union. Runtime validation rejects all unlisted keys. */
export type GovernanceActionRequestV1 = GovernanceActionRequestScopeV1 | GovernanceActionRequestReplanV1 | GovernanceActionRequestDebtV1 | GovernanceActionRequestFutureTouchV1 | GovernanceActionRequestPilotAdmissionV1 | GovernanceActionRequestPilotDisablementV1;
export type GovernanceActionRefusalCodeV1 = "INVALID_REQUEST" | "NON_LOOPBACK_REQUEST" | "PROJECT_NOT_FOUND" | "AUTHORITY_UNAVAILABLE" | "CONFIRMATION_REQUIRED" | "CONFIRMATION_MISMATCH" | "STALE_VERSION" | "FOREIGN_TARGET" | "SELF_CONFLICT" | "ACTION_NOT_AVAILABLE" | "PROVIDER_REFUSED" | "GOVERNANCE_STORE_UNAVAILABLE" | "PERSISTENCE_FAILED" | "PILOT_PREREQUISITE_MISSING" | "PILOT_EXPIRED";
export interface GovernanceActionReceiptV1 {
  readonly actionId: string; readonly projectId: string; readonly kind: GovernanceActionKindV1; readonly action: string; readonly targetKey: string;
  readonly actorId: string; readonly authorizedRole: "FEATURE_OWNER" | "ARCHITECTURE_STEWARD"; readonly reason: string;
  readonly expectedVersion: number; readonly resultingVersion: number; readonly recordedAt: string; readonly providerReceiptId: string;
}
export type GovernanceActionResultV1 =
  | Readonly<{ kind: "governance_action_recorded"; receipt: GovernanceActionReceiptV1; refreshed: GovernanceDashboardReadV1 }>
  | Readonly<{ kind: "governance_action_refusal"; code: GovernanceActionRefusalCodeV1; message: string; currentVersion?: number }>;
