Feature: Authoritative replan governance

  Scenario: E013-RP-001 scopes recurrence by project, feature, phase, gate, and defect class
    Given immutable V3 governance records exist for one exact review scope and defect class
    When the public store and policy reconstruct the aggregate after restart
    Then a foreign scope or defect class cannot mutate that aggregate
    And the public store/policy tests prove the exact-scope positive and refusal controls

  Scenario: E013-RP-002 stops a second post-fix manifestation before a third narrow dispatch
    Given two committed same-class post-fix manifestations have complete predecessor evidence
    When public recurrence composition evaluates the second manifestation
    Then it persists one replan-required transition
    And it makes zero bounded dispatch attempts

  Scenario: E013-RP-003 stops a second accepted scope expansion for the exact class
    Given configured FEATURE_OWNER decisions accept two persisted exact-class scope expansions
    When public reconciliation reads each immutable decision and provenance
    Then the first adds one accepted-expansion observation
    And the second enters remediation-replan-required without a legacy retry

  Scenario: E013-RP-004 persists and approves only a valid reviewer-owned bounded replan
    Given a validated reviewer replan plan is bound to the exact threshold and manifest
    When the configured non-author ARCHITECTURE_STEWARD records the current-version decision
    Then public ingress persists one pending request and public approval records one immutable decision
    And invalid, stale, self, or foreign input mutates neither request nor decision state

  Scenario: E013-RP-005 dispatches and exits only for the exact approved plan and assessment matrix
    Given an exact approved plan has one persisted bounded dispatch reservation
    When the subsequent approved review assesses every declared surface, remediation item, and test
    Then the public phase-exit guard permits progression only with that exact assessment and terminal evidence
    And replay, partial assessment, or missing assessment remains blocked

  Scenario: E013-RP-006 retires legacy recovery authority
    Given a V1 review manifestation has been durably ingested
    When the real continuation route evaluates recurrence
    Then persisted V1 governance runs before every legacy recovery authority
    And fingerprints, progressive retry, Markdown, filenames, Safety Kernel, retry counts, and error prose cannot authorize dispatch
