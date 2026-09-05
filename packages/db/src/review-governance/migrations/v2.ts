/** Additive database-side checks for databases created before enum contracts were frozen. */
export const REVIEW_GOVERNANCE_MIGRATION_V2_SQL = `
create trigger if not exists trg_review_artifacts_v1_check
before insert on hepha_review_artifacts
when typeof(new.schema_version) <> 'integer' or new.schema_version <> 1
begin select raise(abort, 'CHECK constraint failed: hepha_review_artifacts.schema_version'); end;

create trigger if not exists trg_review_runs_manifest_result_check
before insert on hepha_review_runs
when new.manifest_result not in ('APPROVED', 'NEEDS_CHANGES', 'BLOCKED')
begin select raise(abort, 'CHECK constraint failed: hepha_review_runs.manifest_result'); end;

create trigger if not exists trg_review_findings_enum_check
before insert on hepha_review_findings
when new.disposition not in ('IN_SCOPE_BLOCKER', 'SCOPE_EXPANSION', 'ARCHITECTURE_DEBT', 'OBSERVATION')
  or new.claim_type not in ('architecture', 'security', 'policy', 'quality', 'feature_correctness')
  or new.severity not in ('blocker', 'required', 'note', 'info')
begin select raise(abort, 'CHECK constraint failed: hepha_review_findings.enum'); end;

create trigger if not exists trg_review_items_decision_check
before insert on hepha_review_remediation_items
when new.decision is not null and new.decision not in ('APPLIED', 'NOT_APPLIED', 'NOT_APPLICABLE')
begin select raise(abort, 'CHECK constraint failed: hepha_review_remediation_items.decision'); end;

create trigger if not exists trg_review_receipts_enum_check
before insert on hepha_review_verification_receipts
when new.subject_kind not in ('remediation_item', 'test')
  or (new.subject_kind = 'remediation_item' and new.outcome not in ('VERIFIED', 'FAILED', 'NOT_VERIFIABLE'))
  or (new.subject_kind = 'test' and new.outcome not in ('PASSED', 'FAILED', 'NOT_RUN', 'NOT_VERIFIABLE'))
begin select raise(abort, 'CHECK constraint failed: hepha_review_verification_receipts.subject_kind_outcome'); end;
`;
