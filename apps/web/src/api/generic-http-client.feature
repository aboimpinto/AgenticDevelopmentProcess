Feature: Generic dashboard HTTP transport
  Dashboard capabilities share one small transport boundary for JSON requests.

  Scenario: A read returns its JSON representation
    Given a dashboard capability requests a resource
    When the server returns a successful JSON response
    Then the transport returns the parsed representation

  Scenario: A command carries one JSON body
    Given a dashboard capability submits a command
    When the transport sends the request
    Then it uses POST with one JSON body and the JSON content type

  Scenario: A safe server error is presented
    Given the server refuses a request with a safe error message
    When the transport evaluates the response
    Then the caller receives that safe error message

  Scenario: An unstructured failure uses the status
    Given the server refuses a request without a safe error message
    When the transport evaluates the response
    Then the caller receives a deterministic status-based failure
