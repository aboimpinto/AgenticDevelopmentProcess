Feature: Generic human-review finding execution boundary
  The orchestrator handles one durable human finding without depending on a concrete feature identity.

  Scenario: A finding repair returns for user verification
    Given a current feature, finding thread, and findings phase
    When the declared finding worker completes its scoped repair
    Then the phase result and durable agent response await user verification

  Scenario: Finding context disappears before execution
    Given the durable finding or current feature can no longer be resolved
    When the finding worker boundary refreshes its context
    Then no worker starts and the finding returns to open recovery state

  Scenario: Finding execution fails
    Given the declared finding worker reports an execution error
    When the finding execution boundary handles the error
    Then phase recovery is attempted and durable open failure state is recorded
