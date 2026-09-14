Feature: Installation-wide High reasoning and bounded model requests
  Scenario: MR-01 Reject a reasoning downgrade
    Given a worker whose effective thinking level is medium
    When its provider request is prepared
    Then the isolated worker stops before provider dispatch

  Scenario: MR-02 Reject oversized context
    Given a tokenized request exceeding the selected model's available input tokens
    When its provider request is prepared
    Then no provider request is sent and no evidence is discarded

  Scenario: MR-03 Reuse repeated text without changing evidence
    Given a prompt containing repeated evidence qualifications
    When lossless context encoding reduces it within budget
    Then the request uses High reasoning and preserves the exact original context

  Scenario: MR-04 Do not retry policy rejection with another model
    Given an approved primary and fallback model route
    When the primary worker rejects its request under the context or thinking policy
    Then the failure is terminal and no fallback request is purchased

  Scenario: MR-05 Bind the task output allowance at the provider boundary
    Given readiness reserves 16384 output tokens for a model permitting 128000
    When its provider request is prepared
    Then the provider payload requests 16384 output tokens
    And the context guard reserves that same allowance

  Scenario: MR-06 Respect transport-specific output capabilities
    Given the same model can use a public API or a Codex subscription transport
    When readiness requests a smaller output allowance
    Then public Responses and Completions use their supported output-limit fields
    And Codex subscription requests contain no unsupported output-limit fields
    And both the planner and request guard reserve the catalogue maximum for Codex

  Scenario: MR-07 Resolve a provider's current API alias before counting tokens
    Given a supported provider alias identifies a newer published model version
    When HEPHA prepares the selected model tokenizer
    Then it uses that version's pinned checksum-verified assets
    And an explicitly versioned deployment retains its own tokenizer
    And invalid downloaded assets do not become estimated token counts

  Scenario: MR-08 Reject unknown tokenizer capability before worker spawn
    Given a selected model has no verified tokenizer mapping
    When HEPHA launches the pinned runtime attempt
    Then no worker or provider request is started
    And the diagnostic identifies the unsupported provider and model
