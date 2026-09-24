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
