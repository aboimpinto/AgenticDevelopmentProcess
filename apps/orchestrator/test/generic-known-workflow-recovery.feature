Feature: Generic known workflow recovery preparation
  Deterministic recovery should repair known operational boundaries without depending on a feature, phase title, or task identity.

  Scenario: A known review or command-safety stop receives a direct retry plan
    Given a worker stops at a recognized review or command-safety boundary
    When the generic recovery preparer evaluates the failure
    Then it returns the next safe action without launching speculative recovery analysis

  Scenario: Missing local executables are resolved through infrastructure ports
    Given a required executable is absent from the worker environment
    When the generic recovery preparer evaluates the failure
    Then it uses runtime resolution or shim preparation without owning host discovery

  Scenario: An unknown failure is not disguised as recoverable
    Given a failure does not match a deterministic recovery category
    When the generic recovery preparer evaluates the failure
    Then it declines a host-side retry and leaves recovery analysis to the workflow
