Feature: Live activity stream lifecycle

  Scenario: Dashboard rerenders do not accumulate live activity streams
    Given a project dashboard with live activity enabled
    When the live activity connection causes repeated dashboard rerenders
    Then exactly one live activity stream remains open
