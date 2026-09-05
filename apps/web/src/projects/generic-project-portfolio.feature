Feature: Generic project portfolio presentation
  Project delivery status and measured performance are presented independently.

  Scenario: Lifecycle counts remain visible
    Given a registered project has work across lifecycle folders
    When its portfolio card is presented
    Then EPIC, FEAT, submitted, ready, active, completed, and cancelled counts remain visible

  Scenario: Delivery performance uses measured execution
    Given completed workflow and phase evidence is available
    When project performance is calculated
    Then average phase and feature runtime use completed execution evidence

  Scenario: Human delivery is the comparison baseline
    Given comparable human estimates and measured AI execution are available
    When delivery gain is presented
    Then saved time and acceleration compare measured AI runtime with human delivery estimates

  Scenario: Missing evidence stays explicit
    Given no comparable execution evidence is available
    When project performance is presented
    Then unavailable metrics display a neutral placeholder without invented values
