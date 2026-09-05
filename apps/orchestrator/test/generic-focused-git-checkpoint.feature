Feature: Generic focused Git checkpoint
  Durable workflow artifacts are committed without capturing unrelated repository changes.

  Scenario: Changed artifact paths receive a focused commit
    Given one or more workflow artifact files changed inside Git repositories
    When the focused checkpoint adapter records them
    Then it stages and commits only their normalized relative pathspecs

  Scenario: Unchanged artifacts require no commit
    Given the requested artifact paths have no working-tree changes
    When the focused checkpoint adapter records them
    Then it returns no checkpoint without staging unrelated files

  Scenario: A path outside Git is reported explicitly
    Given a requested artifact cannot be associated with a Git root
    When the focused checkpoint adapter records it
    Then it reports the exact path and does not broaden the commit scope
