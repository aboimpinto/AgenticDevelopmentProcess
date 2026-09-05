Feature: Generic final checkpoint test coverage
  A declared final checkpoint measures the executable production lines introduced by the current work item.

  Background:
    Given StartFeature recorded the implementation baseline commit
    And the project final-verification profile declares a final-checkpoint LCOV coverage check
    And RefineFeature declared test coverage in the final checkpoint

  Scenario: Changed production code satisfies the advisory reference
    Given every changed production file has at least 80 percent changed-line coverage
    When the final checkpoint executes the coverage check
    Then the coverage check passes
    And the receipt reports whether the 95 percent target was achieved

  Scenario: Changed FEAT production code is below the advisory reference
    Given a changed production file has less than 80 percent changed-line coverage
    When the final checkpoint executes the coverage check
    Then the existing verification repair worker receives the exact FEAT file coverage evidence
    And repair is limited to production code and tests changed by this FEAT
    And the complete final checkpoint is rerun for the configured improvement attempts
    And remaining low coverage is recorded as a non-blocking reminder
    And the phase and FEAT can complete

  Scenario: FEAT and overall project coverage are presented separately
    Given the LCOV report covers FEAT changes and existing project code
    When the final checkpoint records its coverage receipt
    Then the FEAT details show changed-line coverage with an assessment
    And the FEAT details show overall project coverage as context
    And overall project coverage never expands the FEAT repair scope

  Scenario: Final-phase working-tree code belongs to the FEAT measurement
    Given the FEAT has committed, staged, unstaged, or newly created production files since StartFeature
    When the final checkpoint calculates changed executable lines
    Then every matching FEAT production line is included before the phase git checkpoint

  Scenario: Coverage execution or measurement is unavailable
    Given the coverage command, timeout, baseline, LCOV report, or instrumentation is unavailable
    When the final checkpoint executes the coverage check
    Then the exact reason is recorded as a non-blocking coverage remark
    And no coverage improvement worker is launched without a successful measurement
    And independent build, lint, and test gates remain authoritative
    And the phase and FEAT can complete

  Scenario: An earlier full verification does not run final coverage
    Given a non-final phase declares a full verification task
    When the project verification profile is selected
    Then final-checkpoint-only coverage checks are excluded
    And ordinary build, lint, and test checks still run
