Feature: Generic production module reachability policy
  Production code must belong to an executable application, package, tool configuration, or repository script path.

  Scenario: Runtime entry points reach every production responsibility
    Given application and package source trees with declared entry points
    When the repository quality gate follows their production dependencies
    Then no production module remains disconnected from execution

  Scenario: Every supported dependency form contributes an edge
    Given production modules use static imports, re-exports, dynamic imports, CommonJS requires, and type imports
    When the repository quality gate builds the dependency graph
    Then every resolvable workspace dependency contributes to reachability

  Scenario: Tool entry points participate without a filename allowlist
    Given applications have configuration files and the repository has production scripts
    When the repository quality gate discovers entry points
    Then each generic configuration and root script is treated as executable

  Scenario: Tests cannot keep disconnected production code alive
    Given a production module is imported only from a test artifact
    When the repository quality gate traces production entry points
    Then the disconnected production module blocks the quality gate
