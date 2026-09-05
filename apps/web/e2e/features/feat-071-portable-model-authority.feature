@EPIC-011 @FEAT-071 @playwright
Feature: Direct-host and orchestrated evidence in FEAT Details
  As a Hepha operator
  I want execution mode and model provenance to remain explicit
  So that direct work never displays configured routing as actual model evidence

  @E011-ASSET-004
  Scenario: Direct execution never fabricates actual model evidence
    Given a direct Codex execution has no trusted model instrumentation
    And a later direct Pi execution has trusted observed model provenance
    When the operator expands the phase runtime evidence
    Then both executions are labelled Direct host
    And the Codex model is Not recorded while the Pi model shows its provenance
    And no policy route or secret is displayed as a direct actual model

  @E011-EVID-002
  Scenario: Malformed cross-mode evidence does not replace confirmed Details
    Given FEAT Details displays confirmed route-free direct-host evidence
    When a refresh returns direct evidence contaminated with an orchestrated policy field
    Then the malformed response is rejected atomically
    And the last confirmed direct-host evidence remains visible as stale
