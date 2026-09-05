Feature: Generic orchestrator HTTP boundary
  The local orchestrator must expose a consistent JSON and CORS contract while
  preserving typed failures through its real request-listener composition.

  Scenario: Runtime health passes through the public boundary
    Given the orchestrator runtime is available
    When health is requested through the production orchestrator listener
    Then a typed healthy runtime projection is returned

  Scenario: A valid JSON command passes through the public HTTP boundary
    Given a valid project-registration JSON body
    When the command is sent through the production orchestrator request listener
    Then the response is created as UTF-8 JSON
    And the loopback CORS headers are present
    And the project registration is durably recorded

  Scenario: A new empty directory is accepted as a project root
    Given an existing empty directory has no source-code or Hepha markers
    When it is registered through the production orchestrator request listener
    Then project registration succeeds
    And its future MemoryBank path is recorded for initialization

  Scenario: A typed command failure passes through the public error boundary
    Given a project-registration JSON body naming a missing folder
    When the command is sent through the production orchestrator request listener
    Then the response is a bad request
    And the safe error code and field are preserved

  Scenario: Registered projects pass through the project collection route
    Given projects were registered in a non-alphabetic order
    When the project collection is requested through the production orchestrator listener
    Then every registered project is returned once
    And projects are ordered by name
    And each project includes its filesystem-derived summary

  Scenario: A registered project initializes its MemoryBank through the public route
    Given a registered project without a MemoryBank skeleton
    When project initialization is requested through the production orchestrator listener
    Then the canonical MemoryBank directories and counters are created
    And repeating initialization does not overwrite existing state

  Scenario: Work items are listed through the registered project boundary
    Given a registered project with a valid MemoryBank work item
    When its work-item collection is requested through the production orchestrator listener
    Then the work item and scan status are returned
    And the response includes the current project summary

  Scenario: A current work-item document is read through the project boundary
    Given a work item returned by the registered project collection
    When its document is requested through the production orchestrator listener
    Then the current Markdown and document identity are returned

  Scenario: A generated design document is read through the project boundary
    Given a work item has a contracted generated design document
    When that design document is requested through the production orchestrator listener
    Then the selected design Markdown and document identity are returned
    And arbitrary work-item files remain inaccessible through that route

  Scenario: A registered project opens its MemoryBank event stream
    Given a registered project with an initialized MemoryBank
    When its event stream is opened through the production orchestrator listener
    Then the response is an event stream
    And the initial event identifies the registered project

  Scenario: A registered project opens its live-activity stream
    Given a registered project with workflow activity support
    When its live-activity stream is opened through the production orchestrator listener
    Then the response is an event stream
    And the initial activity event identifies the registered project

  Scenario: A batch command failure passes through the public error boundary
    Given a missing-feature preview names an unknown registered project
    When the preview is sent through the production orchestrator listener
    Then the application failure is returned through the JSON error contract

  Scenario: A work-item submission failure passes through the public error boundary
    Given a work-item submission names an unknown registered project
    When the submission is sent through the production orchestrator listener
    Then the application failure is returned through the JSON error contract

  Scenario: A relationship command resolves its registered project boundary
    Given a feature-to-EPIC command names an unknown registered project
    When the relationship command is sent through the production orchestrator listener
    Then the route reports that the project was not found

  Scenario: An EPIC refinement failure passes through the public error boundary
    Given an EPIC refinement names an unknown registered project
    When the refinement is sent through the production orchestrator listener
    Then the application failure is returned through the JSON error contract

  Scenario: A lifecycle command failure passes through the public error boundary
    Given a feature lifecycle command names an unknown registered project
    When the command is sent through the production orchestrator listener
    Then the application failure is returned through the JSON error contract

  Scenario: A human-review command failure passes through the public error boundary
    Given a human-review command names an unknown registered project
    When the command is sent through the production orchestrator listener
    Then the application failure is returned through the JSON error contract

  Scenario: A manual-test query validates its public contract
    Given a manual-test status query omits its card identity
    When the query is sent through the production orchestrator listener
    Then the route reports the missing query parameters

  Scenario: A workflow console is read through the public boundary
    Given a workflow run has no captured console files
    When its console is requested through the production orchestrator listener
    Then an empty typed console projection is returned

  Scenario: A deep-dive lookup failure passes through the public error boundary
    Given deep-dive metadata storage is unavailable
    When a session is requested through the production orchestrator listener
    Then the application failure is returned through the JSON error contract

  Scenario: A delivery query validates its public contract
    Given a delivery status query omits its card identity
    When the query is sent through the production orchestrator listener
    Then the route reports the missing delivery parameters

  Scenario: Agent tasks are listed through the public boundary
    Given the orchestrator task registry has no submitted tasks
    When the task collection is requested through the production orchestrator listener
    Then an empty typed task collection is returned

  Scenario: Approvals are listed when optional metadata storage is unavailable
    Given approval metadata storage is disabled
    When approvals are requested through the production orchestrator listener
    Then an empty typed approval collection is returned

  Scenario: An empty phase timeline passes through the public boundary
    Given optional timeline metadata storage is unavailable
    When a phase timeline is requested through the production orchestrator listener
    Then an empty generic phase timeline is returned

  Scenario: Empty run analytics pass through the public boundary
    Given optional invocation metadata storage is unavailable
    When project run analytics are requested through the production orchestrator listener
    Then an empty typed metrics projection is returned

  Scenario: Empty receipt evidence passes through the public boundary
    Given optional invocation metadata storage is unavailable
    When project receipts are searched through the production orchestrator listener
    Then an empty typed receipt collection is returned

  Scenario: Provider connections pass through their public boundary
    Given no provider connections are registered
    When provider connections are requested through the production orchestrator listener
    Then an empty provider connection collection is returned

  Scenario: A browser preflight passes through the public HTTP boundary
    Given a browser preflight request
    When the request is sent through the production orchestrator request listener
    Then the response has no content
    And the loopback CORS headers are present
