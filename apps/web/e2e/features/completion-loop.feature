Feature: Generic completion readiness recovery without duplicate verification
  Existing tests and human results are reused. Readiness never completes the feature.

  @CR-01 @Playwright @TwinIntegration
  Scenario: Recognize existing coverage, recover missing execution, and automatically become ready
    Given current manual passes and a verified server execution report
    And an existing browser scenario lacks execution evidence
    When I refresh completion readiness against the accepted feature plan
    Then validated coverage is retained separately from the real execution gap
    When I recover missing execution from its phase
    Then repair receives only the missing criterion and automatically refreshes readiness
    And previously validated coverage remains applicable
    When the new evidence satisfies the accepted obligation
    Then no red quality gaps remain and Complete Feature is enabled but not clicked

  @CR-02 @Playwright @TwinIntegration
  Scenario: Retry an assessment error without inventing test repair
    Given current manual passes and all required execution reports
    When the coverage assessor fails temporarily
    Then refresh offers retry without generating repair gaps or clearing results
    When I retry the assessment against the same accepted scope
    Then Complete Feature is enabled without running a repair or completing the feature

  @CR-03 @Playwright @TwinIntegration
  Scenario: Invalidate changed reports without clearing human passes, then restore readiness
    Given validated coverage and current passing manual results
    When a browser report no longer matches its recorded checksum
    Then refresh revokes only the affected coverage while preserving current human results
    When I restore valid evidence through the phase repair action
    And readiness validates the restored evidence
    Then the repair gap disappears and Complete Feature is enabled without completion

  @CR-04 @Playwright @TwinIntegration
  Scenario: Recognize satisfied coverage without confirmation and reuse unchanged evidence
    Given complete execution evidence for the accepted criteria
    When I refresh repeatedly
    Then no duplicate assessment or repair is created
    And satisfied coverage has no repair button and rejects direct repair requests
    When HEPHA validates the existing evidence mapping
    Then Complete Feature is enabled and the feature remains in progress

  @CR-05 @Playwright @TwinIntegration
  Scenario: Route discovered browser tests to prerequisite-gated execution without implementing duplicates
    Given current manual passes and a verified server execution report
    And browser tests are discovered successfully but have no executed report
    And the controlled execution environment is unavailable
    When I refresh the accepted-scope assessment
    And refresh re-evaluates cached decisions while preserving applicable evidence
    Then the browser requirement stays blocked with its execution prerequisite visible
    And execution is refused until the prerequisite is explicitly acknowledged
    And acknowledging an unavailable environment still cannot create passing evidence
    When I make the environment available and run existing verification from its phase
    Then only existing verification is dispatched and its real report is required
    And readiness refreshes automatically while preserving human results
    When the new evidence satisfies the accepted obligation
    Then Complete Feature is enabled without duplicate test implementation or feature completion

  @CR-06 @Playwright @TwinIntegration
  Scenario: Correct malformed assessment output once using existing evidence without repair
    Given current passing reports and preserved human approvals
    When the assessor returns an invalid execution field
    Then HEPHA requests one corrected response using the same evidence
    And no test repair or passing result is fabricated
    When the schema-validated assessment establishes the accepted coverage
    Then Complete Feature is enabled and the feature remains in progress

  @CR-07 @Playwright @TwinIntegration
  Scenario: Stop after exhausted schema correction and recover through explicit refresh
    Given current passing reports and preserved human approvals
    When repeated assessor corrections make no validation progress
    Then readiness remains blocked with the exact invalid field and a refresh action
    And there are no invented quality gaps or repair dispatches
    When I refresh explicitly and the assessor returns a valid assessment
    And HEPHA validates the accepted evidence mapping
    Then Complete Feature is enabled without changing human results or completing the feature

  @CR-08 @Playwright @TwinIntegration
  Scenario: Assess large interleaved execution evidence without duplicate repair or truncation
    Given large checksum-bound reports with interleaved executed identities and densely related source discussions
    And current manual passes and human review are preserved
    When I refresh completion readiness
    Then lossless compaction preserves every executed identity without raw identity retrieval
    And the feature card shows Compacting context while readiness mutations remain locked
    And oversized extraction results are subdivided with bounded retries and no discarded passages
    And context compaction completion is shown before the final readiness result
    And bounded exact source clauses replace repeated discussions before one collective assessment
    And complementary coverage and the discovery-versus-execution qualification are retained
    And the final assessment fits its prompt budget
    And existing coverage is validated without dispatching test repair
    When the schema-validated assessment establishes the accepted coverage
    Then the manual tests caption is complete and Complete Feature is enabled
    And the feature remains in progress with its original human results

  @CR-09 @Playwright @TwinIntegration
  Scenario: Upgrade split cached blockers into one configured execution and preserve verified coverage
    Given a readiness assessment started outside this browser is still running
    Then competing readiness and repair actions are blocked until it settles
    And reopening the feature preserves busy controls while read-only delivery status remains available
    Given two criteria need the same existing browser run but cached decisions contain a missing and an incorrect test path
    And other criteria have validated coverage and recorded human passes
    When I refresh completion readiness
    Then the cached decisions are rerouted without repeating successful coverage assessment
    And one execution action uses the command and paths from the actual project configuration
    And generic test implementation repair is not offered
    When I acknowledge unavailable setup and attempt execution
    Then preflight blocks without fabricating a pass or creating tests
    When I supply the controlled fixture and run existing verification
    Then automatic readiness refresh preserves human results and assesses the new report
    When the new assessment satisfies the accepted obligation
    Then Complete Feature is enabled and the feature remains in progress

  @CR-11 @Playwright @TwinIntegration
  Scenario: Discover existing mixed evidence and become ready without duplicate execution
    Given checksum-bound server and browser reports and a current recorded operator pass already exist
    And a criterion needs complementary automated and manual verification
    When I refresh completion readiness
    Then HEPHA discovers the existing reports and preserves both evidence kinds
    And no repair or test-execution worker is dispatched
    When HEPHA validates the collective evidence mapping
    Then Complete Feature is enabled with no quality gap
    And the feature remains in progress with unchanged tests, reports, passes and approvals
    When I refresh again after an assessment-version change with unchanged evidence
    Then readiness remains satisfied without another model assessment

  @CR-10 @Playwright @TwinIntegration
  Scenario: Preserve complementary proof and route an execution diagnosis into an explicit scoped repair
    Given passing tests prove part of a criterion and an existing journey lacks execution evidence
    When I refresh readiness and HEPHA validates complete criteria
    Then partial proof remains saved but cannot complete the criterion
    When existing verification inspects delegation and reports missing implementation
    Then automatic refresh offers a phase-scoped repair instead of repeating execution
    And unchanged refresh preserves the diagnosis without dispatching another worker
    When I explicitly repair the phase and HEPHA feeds the remaining diagnosis into the next repair round
    Then automatic refresh validates the combined evidence without duplicating tests
    When the accepted obligation is satisfied
    Then Complete Feature is enabled without completing the feature or changing human results

  @CR-12 @Playwright @TwinIntegration
  Scenario: Explicitly reassess cached unresolved coverage without rerunning tests or losing approvals
    Given current manual passes and all required execution reports
    And a saved assessment leaves a browser criterion unresolved
    When other accepted criteria are verified and a background recheck sees unchanged evidence
    Then the existing assessment is explicitly reported as reused without a model call
    When background readiness explicitly requests a new assessment decision
    Then only unresolved criteria receive a new decision and competing actions are locked
    When that decision remains unresolved and I explicitly reassess again
    Then the prior final-decision checkpoint cannot suppress the requested assessment
    And approved coverage, source reports and human results remain unchanged
    When the reassessment establishes the accepted coverage
    Then Complete Feature is enabled without running tests or completing the feature

  @CR-14 @Playwright @TwinIntegration
  Scenario: A returned repair without execution evidence retries three times and reports the unresolved cause
    Given configured existing browser tests with no execution report
    When explicit phase repair dispatches verification and the worker returns only a claim that tests were created
    Then automatic reassessment still reports the execution gap
    And the repair outcome is failed with an explicit unresolved verification message
    And three owned repair rounds receive the current missing-evidence diagnosis
    And the stop report explains each result and directs the user to the repair guidance textbox
    And no coverage approval or feature completion occurs

  @CR-15 @Playwright @TwinIntegration
  Scenario: Large routing context reaches existing verification without discarding evidence
    Given current manual passes and existing configured verification without an execution report
    And many distinct partial-proof qualifications make routing exceed the former character limit
    And the selected model has sufficient token capacity for the complete request
    When background readiness assesses coverage and I explicitly request phase verification
    Then routing preserves the qualifications and the phase action dispatches the configured verification worker once
    And the saved execution report is imported and its coverage is validated without feature completion
    When the accepted obligations are satisfied
    Then Complete Feature is enabled without completing the feature or repeating passing verification
