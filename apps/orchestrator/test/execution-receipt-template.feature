Feature: Host-owned receipt template and independently verified execution facts
  A model fills a versioned contract; it cannot redefine execution identity or evidence.

  Scenario: Template, instructions and validation share one schema
    Given HEPHA has admitted configured checks for a fresh invocation
    When it prepares execution
    Then it binds the reserved output directory to the current host-owned directory
    And it supplies receipt-context.json, receipt-template.json and receipt-schema.json
    And outcome placeholders remain unknown rather than passing
    And an unfilled template fails validation
    And a correctly filled exchange with matching native reports is admitted

  Scenario Outline: Model creativity cannot change the result contract
    Given a receipt references a native report with one passing test
    When the model changes <field>
    Then validation rejects the result without accepting execution evidence
    Examples:
      | field                       |
      | a required field name       |
      | an invented approval field  |
      | boolean success into text   |
      | counts beyond the report    |
      | the report checksum         |
      | the selected command        |
      | the selected check kind     |
      | a duplicated check identity |

  Scenario: Existing passing reports survive a command-template representation difference
    Given a legacy receipt records the actual output path
    And the admitted plan uses HEPHA's reserved output-directory placeholder
    When the shared importer validates the receipt
    Then it binds that placeholder deterministically
    And imports the unchanged reports without model correction or repeated execution
    And other command, source and report checks still apply

  Scenario: Host paths remain literal shell arguments
    Given the run directory contains spaces, quotes, dollar signs or backticks
    When HEPHA binds a quoted or unquoted output-directory placeholder
    Then execution receives the literal path as one argument
    And unrelated environment variables and escaped dollars are not expanded by HEPHA

  Scenario: Audit metadata cannot manufacture or block a pass
    Given a valid receipt exchange omits its optional run ID
    When HEPHA enriches its audit metadata
    Then it preserves the original worker exchange and native reports
    And actual evidence still determines success


  Scenario: Build provenance is supporting data rather than another test report
    Given an executed suite has a passing native report and a build-provenance JSON file
    When the receipt puts provenance in artifacts and the test report in reportPath
    Then both checksums are validated and only the native report counts as tests
    And altered provenance is rejected
    And provenance alone cannot establish passing test evidence
