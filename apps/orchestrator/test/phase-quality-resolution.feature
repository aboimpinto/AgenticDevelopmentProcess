Feature: Human-directed phase verification recovery
  Completed implementation work does not imply verified or accepted delivery.
  Gate recovery does not require repeating discovery or advancing implementation.

  Scenario: Repair one unresolved gate
    Given a resolved phase with unverified automated test evidence
    When the human requests a repair with additional integration scenarios
    Then exactly one worker targets that phase and gate
    And existing evidence is inspected before creating tests
    And a worker return alone does not satisfy the gate or advance implementation

  Scenario: Record a justified exception without fabricating a pass
    Given two unresolved phase gates and no recorded failures
    When the human explicitly confirms a meaningful waiver for one gate
    Then the selected gate is recorded as waived with its prior evidence preserved
    And the other gate and human acceptance remain unresolved

  Scenario: Reject unsafe or stale decisions
    Given a stale phase document or an unconfirmed waiver or a known failed check
    When a waiver is requested
    Then artifacts remain unchanged and no worker starts

  Scenario: Preserve cancellation authority
    Given a running phase gate repair
    When the human cancels and its worker returns late
    Then the cancelled workflow is not overwritten with success

  Scenario: Repair mixed investigation and confirmed findings in the same invocation
    Given a phase with an uncertain evidence mapping and a confirmed missing assertion
    And separate coverage links awaiting human confirmation
    When the human requests investigation and repair of the phase findings
    Then the worker receives both unresolved findings and their prior diagnoses
    And it traces existing evidence, fixes confirmed in-scope defects, and executes affected checks
    And old inspection-only instructions cannot stop that authorized repair
    And human coverage confirmation is excluded from the repair authority

  Scenario: Verify changed source automatically after repair
    Given an explicitly authorized repair has returned
    When reassessment detects that source changed since fresh verification
    Then fresh verification starts automatically for the current source
    And worker prose cannot grant completion or human acceptance
    But cancellation or a successor run prevents that handoff
    And an unrelated assessment failure does not authorize another execution

  Scenario: Repair is verified before it is considered resolved
    Given a user requests repair of a phase build warning
    When the first worker returns without the required execution evidence
    Then HEPHA supplies that missing evidence diagnosis to another repair attempt
    And stops the repair loop only after the selected gate is verified resolved

  Scenario: Three repairs leave the same issue unresolved
    Then HEPHA reports the work claimed and verified result of each round
    And identifies the remaining cause and explains why automatic repair stopped
    And the user can enter additional guidance in the phase textbox
    And a new repair request starts a new bounded loop with that guidance
