Feature: Generic production module size policy
  Production responsibilities remain bounded as the codebase evolves.

  Scenario: Every production module stays within the hard ceiling
    Given application and package production source trees
    When the repository quality gate measures every source module
    Then no production module contains more than one thousand lines

  Scenario: Test artifacts do not influence the production measurement
    Given tests and type declarations can be colocated with production modules
    When the repository quality gate discovers source modules
    Then test artifacts and type declarations are excluded from the measurement

  Scenario: A future oversized module blocks the quality gate
    Given a production module exceeds the hard ceiling
    When the repository quality gate evaluates its measurement
    Then the module is reported as a size violation
