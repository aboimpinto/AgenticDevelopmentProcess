Feature: Generic workflow retry context
  A workflow retry receives one compact failure brief and current Git context
  without depending on the original full transcript.

  Scenario: A failed run produces a compact brief
    Given the latest workflow run failed with an authoritative error
    When retry context is collected
    Then the failure presenter creates one compact persistent brief

  Scenario: An existing brief is compacted again
    Given the stored summary already contains a persistent failure brief
    When retry context is collected
    Then prior retry history is compacted instead of nested

  Scenario: Approved review evidence supersedes a prior blocker
    Given durable approval supersedes the stored failure text
    When retry context is collected
    Then no obsolete failure brief is injected

  Scenario: Git read failure is non-blocking context loss
    Given the current branch or revision cannot be read
    When workflow context is assembled
    Then an empty Git value is returned without failing the workflow
