Feature: Generic deep-dive session control

  Scenario: Generating sessions are reconciled by polling
    Given an open session is generating questions
    When durable session state is polled
    Then the controller replaces its local session with the server state

  Scenario: Starting a session binds current project and work item
    Given a current project and selected work item
    When a deep-dive is started
    Then the controller sends both identities and opens the returned session

  Scenario: Decisions and chat update the same session
    Given an active question session
    When an answer or clarification is submitted
    Then the controller replaces local state with the returned session

  Scenario: Completion reconciles and resumes deferred work
    Given a recovery session was opened for deferred work
    When document completion succeeds
    Then work items refresh and the deferred work resumes
