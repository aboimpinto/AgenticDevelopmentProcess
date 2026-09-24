Feature: Feature-scoped MCP execution workspace
  Scenario: Dedicated code worktree and shared external documentation
    Given a registered checkout is on another feature branch
    And the requested feature has one Git worktree with unfinished feature files
    And its external MemoryBank shares a dirty parent with other projects
    When an autonomous continuation is launched
    Then one Pi session starts in the requested feature worktree
    And the original feature path and autonomous mode are preserved
    And the code clean-worktree gate remains applicable
    And the parent repository receives no Git mutations or cleanliness requirement

  Scenario: Ambiguous or unavailable feature workspace
    Given the feature has multiple matching worktrees or an unavailable worktree
    When implementation is requested
    Then execution fails before Pi launches
    And no alternate feature checkout is used

  Scenario: Initial start without a feature worktree
    Given the registered project is an independent Git checkout on main
    When initial implementation is requested
    Then MCP may initialize the feature from that checkout
    And an internal MemoryBank remains within the code repository scope

  Scenario: Runtime receipts survive a code checkout change
    Given the worker cwd is the feature worktree
    When the plan-bound runtime records an invocation and phase contract
    Then project evidence remains indexed under the registered project

  Scenario: Historical relative evidence survives continuation
    Given a prior invocation stored relative execution and review reports in the registered checkout
    When acceptance is evaluated from the feature worktree
    Then those historical reports remain readable
    And historical source files cannot substitute for missing worktree source
    And a current failing report cannot fall back to an older passing report

  Scenario: A new gate cannot reuse an unrelated old report
    Given a registered checkout contains an old passing report
    When the worker creates or changes a gate record after launch
    Then historical fallback is unavailable for that record
    And missing current evidence blocks acceptance
