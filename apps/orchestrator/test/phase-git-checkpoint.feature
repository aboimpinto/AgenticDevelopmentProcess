Feature: Generic phase git checkpoint
  Branch identity and remote persistence are workflow invariants independent
  from phase number, title, role, and task topology.

  Scenario: Start Feature selects the FEAT branch in every workflow repository
    Given the project and MemoryBank are separate git repositories
    When Start Feature prepares the implementation branch
    Then both repositories use the same derived FEAT branch

  Scenario: A wrong branch blocks phase work before dispatch
    Given Start Feature selected a FEAT branch
    And a repository is later switched to another branch
    When Continue Implementation or a phase begins
    Then HEPHA reports a feature branch mismatch
    And no phase worker or commit is started

  Scenario: A completed phase is committed, audited, and pushed
    Given every declared phase task and exit gate succeeded
    When the generic phase git checkpoint runs
    Then phase work is committed with the FEAT and phase identity
    And the phase document records the immutable phase commit
    And the FEAT branch is pushed and verified

  Scenario: A fork is selected when an unconfigured branch has both fork and upstream remotes
    Given a feature branch has no configured push remote
    And its repository has a writable fork remote and an upstream origin remote
    When the generic phase git checkpoint runs
    Then HEPHA pushes and verifies the feature branch on fork
    And it does not attempt to publish the branch to origin

  Scenario: A commit or push failure never fails the completed phase
    Given every declared phase task and exit gate succeeded
    When any git checkpoint operation fails
    Then the phase remains completed
    And the git checkpoint is recorded as pending
    And no later phase is started

  Scenario: A transient push failure resumes at the checkpoint
    Given phase work and its audit were committed locally
    But the remote push failed
    And unrelated uncommitted work appears after the checkpoint seal
    When the same phase checkpoint is resumed
    Then HEPHA pushes the existing commits without rerunning phase work
    And it leaves the unrelated work unstaged
    And the phase checkpoint becomes satisfied
