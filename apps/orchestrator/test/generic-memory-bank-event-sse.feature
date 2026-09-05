Feature: Generic MemoryBank event SSE delivery
  Project subscribers receive legacy change events while filesystem activity is bridged to live activity.

  Scenario: A project notification reaches a connected subscriber
    Given a MemoryBank event subscriber is connected for a project
    When a mapped project notification occurs
    Then the subscriber receives a legacy MemoryBank change event

  Scenario: A filesystem change reaches both event channels
    Given a project Features folder is being observed
    When its filesystem fingerprint changes
    Then a debounced legacy change event and a live activity event are emitted

  Scenario: Native filesystem observation is unavailable
    Given polling is configured or recursive filesystem observation fails
    When the MemoryBank tree changes
    Then fingerprint polling continues change delivery without failing the workflow
