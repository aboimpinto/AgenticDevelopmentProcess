@EPIC-011 @FEAT-060 @playwright @deterministic
Feature: Models dashboard and catalog recovery
  As a Hepha operator
  I want to inspect only current safe catalog facts in Models
  So that I can choose a model and recover a failed scan without a secret leak

  Background:
    Given a deterministic Models dashboard fixture
    And the Models destination is open

  @E011-PROV-001
  Scenario: An operator sees enough metadata to choose between available models
    Given two connections expose the same model ID with different endpoint and pricing facts
    When the operator selects the OpenRouter connection model
    Then the selected detail identifies that connection and exact model ID
    And the selected detail shows availability, scan time, limits, modalities, capabilities, endpoint, and supplied pricing
    And the duplicate model IDs remain distinct current listbox options

  @E011-PROV-002
  Scenario: A custom provider key is never exposed while its models are scanned
    Given a custom connection has a distinctive test secret outside the browser catalog contract
    When the operator scans and selects its current catalog model
    Then the safe catalog model remains selectable
    And no Models response, visible text, accessible attribute, or browser console event contains the distinctive test secret

  @E011-PROV-003
  Scenario: A failed scan removes a stale catalog and surfaces actionable recovery
    Given provider A and provider B each have a current selectable model
    When a scan for provider A returns a safe payment-required failure
    Then provider A's model is no longer selectable or selected
    And provider B's model remains selectable
    And the Models destination shows actionable safe recovery for provider A
    And routing reset, policy revision, and acknowledgement assertions remain deferred to FEAT-061

  @E011-PROV-004
  Scenario: An authenticated Pi Session supplies models without a copied key
    Given the configured Pi Session has a current catalog model
    When the operator scans and selects the Pi Session model
    Then the model is selectable with the Pi Session connection label
    And no API-key field, token claim, or worker launch receipt is presented
    And worker launch evidence remains deferred to FEAT-062
