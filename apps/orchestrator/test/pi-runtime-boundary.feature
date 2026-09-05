Feature: Generic Pi runtime boundary
  Pi discovery must resolve host executables without knowing a feature, phase, or workflow task.

  Scenario: A configured Pi executable is resolved from the host filesystem
    Given a configured Pi executable exists
    When the production Pi resolver evaluates the runtime environment
    Then the configured executable is selected with auditable source evidence

  Scenario: Missing Pi discovery returns actionable diagnostics
    Given no Pi executable exists on the host
    When the production Pi resolver evaluates the runtime environment
    Then discovery returns diagnostics without spawning a process

  Scenario: An implementation profile receives declared runtime skills
    Given a generic implementation prompt and declared skill paths
    When production Pi arguments are constructed
    Then the profile is approved with each declared skill and explicit model routing

  Scenario: A recovered Pi stream ends with usable assistant output
    Given a newline-delimited Pi stream contains a transient error and later success
    When the production Pi event parser interprets the stream
    Then the latest assistant output is returned without a terminal error

  Scenario: Internal model activity is hidden from the operator console
    Given a Pi stream contains thinking and tool execution events
    When the production console renderer projects the events
    Then thinking is hidden and concrete tool activity remains visible

  Scenario: Cancelling a workflow terminates every attached live Pi process
    Given multiple Pi processes are registered for one generic workflow run
    When the production process registry cancels that run
    Then every live process is terminated and the run is no longer active

  Scenario: An implementation prompt is materialized as a session artifact
    Given a generic implementation prompt and workflow run identity
    When the production prompt materializer prepares the Pi argument
    Then the complete prompt is stored under the session directory

  Scenario: A timed-out Cargo tool remains an active safety blocker
    Given an implementation worker has a tracked Cargo tool call
    When Pi reports that tool result as timed out
    Then the production safety policy blocks a retry and preserves the active call

  Scenario: A one-shot worker recovers within the same process attempt
    Given a generic Pi process emits a transient error followed by terminal success
    When the production one-shot runner executes that process
    Then it returns the successful assistant output without retrying the process

  Scenario: A detached worker releases its workflow ownership after exit
    Given a generic detached Pi process is attached to a workflow run
    When the production detached runner launches and the process exits
    Then its output is logged and the workflow has no active process

  Scenario: A discovered Cargo executable is exposed to Pi through a shim
    Given a Cargo executable exists outside the Pi process PATH
    When the production Pi environment is assembled
    Then an executable shim is prepended without discarding the existing PATH

  Scenario: A zero-based contracted phase is a valid runtime context
    Given an implementation contract declares its first phase at index zero
    When the plan-bound runtime validates the phase invocation context
    Then the selected worker is allowed to launch normally

  Scenario: An unauthenticated agent task fails before process creation
    Given a generic queued agent task selects an unavailable model credential
    When the production agent task runtime starts the task
    Then the task fails with the authentication reason and no process becomes active
