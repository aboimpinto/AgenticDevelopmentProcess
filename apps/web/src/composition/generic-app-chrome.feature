Feature: Generic dashboard application chrome
  Navigation, status, and notices frame every dashboard capability consistently.

  Scenario: Primary navigation dispatches a selected view
    Given the dashboard frame is visible
    When a user selects a primary destination
    Then the navigation delegates that view without changing domain state

  Scenario: Live status remains explicit
    Given an orchestrator and MemoryBank connection state is known
    When the top bar is presented
    Then connectivity and last-live information remain visible

  Scenario: Errors and notices use distinct banners
    Given the dashboard has either an error or a successful notice
    When the frame presents the message
    Then its visual role identifies the message kind

  Scenario: MemoryBank initialization stays caller-owned
    Given a selected project needs initialization
    When its banner is presented
    Then the initialize action delegates to the provided callback
