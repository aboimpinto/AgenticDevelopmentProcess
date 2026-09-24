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
    When the worker creates or changes a check after launch
    Then historical fallback is unavailable for that check
    And missing current evidence blocks acceptance

  Scenario: Unrelated record changes retain prior check evidence
    Given a check has a historical report referenced before launch
    When another check or a documentation field changes
    Then the unchanged check retains access to its historical report

  Scenario: Checks use distinct same-named reports
    Given two checks in different directories reference report.log
    When their results are evaluated
    Then each check reads only its own directory's report

  Scenario: Revised criteria require corresponding evidence
    Given historical test and review references were captured before launch
    When a criterion or assertion mapping changes
    Then historical fallback is unavailable for checks mapped to that revised scope
    And historical approval cannot cover the revised review scope
    And unrelated mapped checks retain their evidence
