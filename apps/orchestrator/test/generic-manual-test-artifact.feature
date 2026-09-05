Feature: Generic manual-test artifact resolution
  Artifact delivery follows the current work-item folder and an immutable pack archive.

  Scenario: A completed work item serves its current archived verification artifact
    Given a work item moved after its verification pack was generated
    And the current archive contains the requested artifact
    When the production artifact resolver evaluates the request
    Then it returns the artifact under the current work-item folder
    And the historical persisted path is not followed
