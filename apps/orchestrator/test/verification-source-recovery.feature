Feature: Browser-owned recovery of verification source changes
  Scenario: Configured generation settles on the next execution
    Given a configured verification runner regenerates a tracked output
    When the user refreshes completion readiness
    Then HEPHA records the changed filename and both content hashes
    And reinspects setup with the diagnosis without changing accepted obligations
    And reruns every check in a new directory without another user click
    And assesses acceptance only after stable source and valid fresh reports
    And preserves manual acknowledgements and explicit completion authority

  Scenario: A runner continuously changes tracked output
    When three successive executions change their source fingerprints
    Then HEPHA stops with the changed-file diagnosis and saved attempt reports
    And the browser offers Retry verification

  Scenario: Real source changes introduce a test failure
    Then recovery reruns against the changed source
    And failing tests cannot be replaced with earlier green reports

  Scenario: The user cancels automatic recovery
    Then no subsequent test execution or acceptance is authorized

  Scenario: Feature requirements change during verification
    Then HEPHA requires review of the changed plan instead of automatically adopting it
