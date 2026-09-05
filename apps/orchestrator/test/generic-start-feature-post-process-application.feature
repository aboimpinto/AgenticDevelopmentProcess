Feature: Generic Start Feature post-processing
  Scenario: Routing and estimates are completed
    Given a transitioned feature and historical estimation context
    When post-processing runs
    Then routing output and complete timing evidence authorize the result

  Scenario: Timing evidence remains incomplete
    Given the routing worker returns without complete estimates
    When timing authorization runs
    Then post-processing fails before observers receive completion
