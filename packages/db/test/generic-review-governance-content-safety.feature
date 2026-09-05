Feature: Generic review evidence content safety
  Unsafe text must be rejected before it becomes authoritative evidence.

  Scenario: Ordinary review text remains usable
    Given review evidence contains well-formed Unicode and benign policy vocabulary
    When the evidence safety boundary scans it
    Then the content is accepted

  Scenario: Unsafe transport characters are rejected
    Given review evidence contains a control byte or malformed Unicode
    When the evidence safety boundary scans it
    Then a deterministic security violation is returned

  Scenario: Secret-like assignments are rejected
    Given review evidence contains a credential label with an assigned value
    When the evidence safety boundary scans it
    Then a deterministic security violation is returned

  Scenario: Decoded nested values are scanned
    Given canonical JSON contains escaped nested string values
    When the parsed evidence safety boundary scans the value tree
    Then unsafe decoded values cannot bypass transport scanning
