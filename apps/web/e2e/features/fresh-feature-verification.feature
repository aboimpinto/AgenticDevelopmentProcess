Feature: Refresh verifies current feature code instead of trusting historical passes
  Explicit Refresh owns one bounded feature-wide verification run.
  Background assessment and human acceptance never start another test run.

  Scenario: FV-01 Fresh execution replaces historical evidence across phases
    Given a feature has passing historical reports from several phases
    And multiple criteria share one configured suite
    When the user refreshes completion readiness
    Then HEPHA inspects all phase verification obligations before executing
    And each distinct feature-related suite executes once against current code
    And unrelated suites do not execute
    And only this run's validated reports supply automated acceptance evidence
    And complementary coverage is proposed without completing the feature

  Scenario: FV-02 A current failure cannot be hidden by an older pass
    Given historical tests passed before a later phase changed the code
    When the user refreshes completion readiness
    Then the existing tests execute and expose the regression
    And readiness remains blocked with the failing check identified
    And neither requirements nor assertions are weakened

  Scenario: FV-03 Missing setup context triggers inspection before execution
    Given assessment has an investigation gap for an existing test
    And the repository contains its setup instructions
    When the user refreshes completion readiness
    Then HEPHA inspects the repository and verifies prerequisites
    And executes the configured test and saves its report

  Scenario: FV-04 Skips and missing reports cannot establish readiness
    Given historical reports passed
    When fresh verification skips required tests or returns without reports
    Then readiness remains blocked without substituting historical results
    And background assessment does not dispatch a retry worker

  Scenario: FV-05 Changes during verification invalidate the result
    Given a fresh verification run is executing
    When source code changes before verification settles
    Then its results cannot certify the current feature
    And readiness explains that another fresh verification is required

  Scenario: FV-06 Another explicit Refresh executes again
    Given fresh feature verification has finished
    When the user refreshes completion readiness again
    Then all feature-related checks execute again even if code is unchanged
    And the documented plan is revalidated and reused without another planning worker
    And each run writes fresh reports in its own directory
    And concurrent Refresh is rejected while the run is active
    And saved manual results and human acceptance are not fabricated or erased

  Scenario: FV-07 An explicit budget stop preserves inspection progress for revalidation
    Given a feature inspection has saved a partial configured verification plan
    And the operator input-spending cap stops its next request
    Then no tests or fallback model execute and no evidence is approved
    And the feature shows the spending blocker without raw request telemetry
    When the operator adjusts the budget and explicitly refreshes again
    Then HEPHA revalidates the saved inspection checkpoint against current source
    And completes inspection before running all selected tests and assessing fresh reports

  Scenario: FV-08 A mixed plan is corrected before real tests and evidence assessment
    Given inspection returns tests and a preflight check incorrectly classified as a test
    When the user refreshes completion readiness
    Then bounded plan correction classifies the preflight without discarding required tests
    And the card distinguishes inspection, correction, preparation and actual test execution
    And relevant test processes execute and save new reports
    And report validation precedes evidence assessment
    And preflight logs never substitute for test coverage or human acceptance

  Scenario: FV-09 A renamed documented test invalidates the saved plan
    Given a feature has a validated plan and fresh reports
    When its test is renamed and FeatureDescription.md and the configured runner are updated together
    And the user refreshes readiness
    Then the previous plan is invalidated and the updated inventory is inspected
    And the renamed test executes with fresh evidence instead of the old command
    And existing manual results remain saved and completion still needs human acceptance

  Scenario: FV-10 HEPHA supplies an omitted invocation ID after real execution
    Given the execution worker runs the planned synthetic test processes
    And saves native reports and a receipt without runId
    When HEPHA finalizes that current owned invocation
    Then the canonical receipt contains HEPHA's current runId
    And the original worker receipt remains unchanged without runId
    And the shared importer validates the reports before coverage assessment
    And human acceptance is still required for completion

  Scenario: FV-11 HEPHA rejects an explicitly different invocation ID
    Given the execution worker runs the planned synthetic test processes
    But writes an explicitly different runId into the receipt
    When HEPHA validates that current invocation
    Then readiness is blocked with a runId mismatch diagnosis
    And the different ID is never silently replaced or accepted

  Scenario: FV-12 Refresh continues when optional runId enrichment is unavailable
    Given real planned test processes produce current passing native reports
    And their receipt includes an execution timestamp but omits runId
    And optional ID enrichment cannot replace an existing audit artifact
    When HEPHA validates the unchanged ID-less receipt
    Then fresh evidence assessment proceeds and the audit artifact remains unchanged
    And human confirmation can establish readiness with runId still absent

  Scenario: FV-13 Fresh execution remains valid despite yesterday's receipt timestamp
    Given all selected checks execute now and produce passing native reports
    But their receipt without runId claims yesterday's execution timestamp
    When HEPHA validates current readiness
    Then fresh evidence assessment proceeds without rewriting the timestamp or adding runId
    And human confirmation can establish readiness

  Scenario: FV-14 Equivalent cwd-prefixed execution reaches readiness with its receipt unchanged
    Given the plan stores the test command and configured working directory separately
    When the worker executes each configured test through cd to that directory followed by the command
    And records that full invocation with fresh native reports
    Then the shared importer accepts the equivalent command presentation
    And the receipt retains the original cwd-prefixed commands
    And human confirmation can establish readiness after evidence assessment

  Scenario: FV-15 Fresh execution reaches readiness without timestamp or runId
    Given all selected synthetic test processes execute and produce passing native reports
    And the receipt timestamp and runId are absent
    And optional ID enrichment cannot replace the existing audit artifact
    When the user refreshes readiness
    Then native evidence assessment proceeds with the original receipt unchanged
    And human confirmation enables feature completion

  Scenario: FV-16 A malformed receipt timestamp does not block fresh execution
    Given all selected synthetic test processes execute and produce passing native reports
    And the receipt timestamp is malformed and runId is absent
    And optional ID enrichment cannot replace the existing audit artifact
    When the user refreshes readiness
    Then native evidence assessment proceeds with the original receipt unchanged
    And human confirmation enables feature completion

  Scenario: FV-17 A future receipt timestamp does not block fresh execution
    Given all selected synthetic test processes execute and produce passing native reports
    And the receipt timestamp is in the future and runId is absent
    And optional ID enrichment cannot replace the existing audit artifact
    When the user refreshes readiness
    Then native evidence assessment proceeds with the original receipt unchanged
    And human confirmation enables feature completion

  Scenario: FV-18 A configured nested manifest is resolved before execution and reused on the next Refresh
    Given the selected Cargo command omits its configured nested manifest path
    And no manifest is discoverable from its configured working directory
    When the user refreshes readiness
    Then HEPHA resolves the single configured manifest before dispatching any check
    And the original plan and command correction remain auditable
    And the corrected command executes and matches the receipt context and validation plan
    And human confirmation can establish readiness from fresh test evidence
    When the user refreshes again without source changes
    Then the saved corrected command is reused and every test executes again

  Scenario: FV-19 Hash-first working-tree evidence reaches readiness without losing source qualifications
    Given the selected checks execute actual assertions and save passing native reports
    And their receipt records a hash followed by qualified working tree state
    And another check records a qualified working-tree baseline with hyphenated wording
    When the user refreshes readiness
    Then HEPHA imports the executed evidence while preserving the complete source qualification
    And human confirmation enables feature completion

  Scenario: FV-20 Additional console capture preserves the planned tests and valid native evidence
    Given a configured test runner writes its native report and console output separately
    When the worker adds a run-owned console log redirection to the unchanged command
    Then the actual assertions execute and their native reports reach assessment
    And the extra log capture does not change the selected tests or rewrite the receipt
    And human confirmation enables feature completion

  Scenario: FV-21 Execution receives configured checks without inherited prerequisite prose
    Given an inspection reason repeats an unrelated external-service requirement
    And the actual configured fixture needs no external service
    When HEPHA dispatches execution
    Then the worker receives configured commands and source references without historical reasons
    And the receipt context contains only execution identity fields
    And the actual test processes execute and their evidence reaches assessment
