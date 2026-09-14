Feature: Completion recovery after implementation quality gaps
  Refresh reassesses current evidence; it never manufactures approval or completes a feature.

  Scenario Outline: native executed reports reach readiness without repeating passing tests
    Given a checksum-bound <reporter> report with complete passing test identities
    And a qualified tested working-tree revision and checksum-bound companion build log
    And current reviewed manual PASS records
    When production readiness refresh imports the existing evidence
    Then the assessor receives every executed identity without counting the companion log as more tests
    And proposed coverage still requires explicit confirmation
    When the current proposal establishes all remaining coverage and is confirmed
    Then Complete Feature becomes available and manual verification is complete
    And the original package and human results remain unchanged
    But changing a report or its checksum-bound companion invalidates that coverage

    Examples:
      | reporter              |
      | native Playwright JSON |
      | .NET TRX              |

  Scenario: invalid native reports do not fabricate coverage
    Given discovery-only, skipped, failed, flaky, duplicate or incomplete native report results
    Or TRX without matching test definitions or with a forbidden XML declaration
    Or summary-only output from an unproven prebuilt binary
    When the importer validates those records
    Then no passing execution evidence is created

  Scenario: archived passing reports and importer upgrades preserve prior human authority
    Given checksum-bound primary and supplemental reports with qualified working-tree provenance
    And an assessment cached before native reporters were supported
    When readiness refresh uses the upgraded importer
    Then the complete report identities are assessed using the new version fingerprint
    And neither report archive aliases nor companion logs create duplicate tests
    And existing manual passes remain authoritative over stale Markdown claims

  Scenario: a rejected mapping does not discard unrelated valid coverage proposals
    Given a model proposes a valid manual evidence link for one criterion
    And a manual-only link for another criterion that explicitly requires automated execution
    When readiness validates the proposed links
    Then the first proposal remains available for human confirmation
    And only the automation criterion receives that rejection reason
    And a criterion with contradictory or invalid mappings remains unresolved

  Scenario: repair settlement automatically uses the real readiness refresh without accepting its proposal
    Given a human started a phase quality repair with recorded manual passes and user code review
    When that repair settles without cancellation or a successor run
    Then the server invokes the same completion readiness refresh once
    And the dashboard is notified after reassessment even if the popup was closed
    And passing results and user approvals remain unchanged
    And a proposed semantic coverage link still needs explicit confirmation
    And no subsequent repair or feature finalization starts automatically

  Scenario: failed automatic reassessment preserves the repair outcome and offers retry
    Given a phase repair fails and readiness refresh also encounters an error
    Then the repair failure is preserved
    And the recorded outcome directs the user to Refresh Completion Readiness
    And cancelled or superseded repairs do not start automatic reassessment

  Scenario: repaired gaps preserve passing results while confirmed links recover completion readiness
    Given all implementation phases and quality gates have been resolved
    And the user's code review and existing manual case passes are recorded
    But acceptance criterion links remain unresolved
    When the user refreshes completion readiness
    Then existing evidence links are proposed for human confirmation
    When the user confirms the current proposal
    Then readiness permits explicit feature completion without replacing the pack or its results

  Scenario: source changes invalidate proposals without inventing approvals or clearing results
    Given a current proposed coverage mapping
    When a source document changes or a wave task becomes unresolved
    Then the old proposal cannot be confirmed
    And refresh points to the unresolved phase task

  Scenario: a model timeout offers assessment retry without inventing test repair work
    Given unresolved acceptance coverage and an unavailable model route
    When the user refreshes completion readiness
    Then existing passes remain recorded
    And the blocker directs the user to retry readiness assessment
    And no missing-test phase repair is inferred from the model failure

  Scenario: refresh invalidates legacy cached assessments while preserving the manual package and human results
    Given a saved coverage proposal produced by the prefix-only assessment algorithm
    When the server restarts with the complete-index algorithm and readiness is refreshed
    Then the old proposal cannot be confirmed
    And unchanged evidence is reassessed with the current algorithm version
    And current manual results and the package identity are preserved
    And another unchanged refresh can reuse the new proposal

  Scenario: large execution reports are inspected completely before coverage is assessed
    Given passing evidence distributed across multiple report pages
    When the bounded extraction pages finish
    Then every original identity was supplied to extraction
    And the final assessor sees relevant identities from both early and late pages
    And extraction alone cannot approve coverage or record test results

  Scenario: incomplete extraction cannot create missing-test repair work
    Given a failed page or an invalid identity reference or oversized final context
    When readiness attempts to assess coverage
    Then no partial proposal is published
    And readiness offers assessment retry instead of inferring missing implementation

  Scenario: uncovered criteria become grouped actionable phase gaps
    Given fourteen unresolved acceptance criteria and a unique verification phase
    And planning mentions those criteria but has no outstanding implementation task
    When the user refreshes completion readiness
    Then one acceptance coverage quality gap is published in the verification phase document
    And readiness shows only the quality gap count and a link to its repair control
    And the repair agent receives every missing criterion without a new human finding
    And repeating refresh does not duplicate instructions or invalidate passing results

  Scenario: refresh imports executed receipt evidence and saved human passes without regenerating the pack
    Given checksum-bound reports with executed test identities and current manual PASS records
    When readiness refresh assesses unresolved acceptance coverage
    Then it sees the executed assertions and authoritative pack-bound manual outcomes
    And the unchanged package and manual results are preserved
    And proposed semantic links require explicit confirmation
    And changing a referenced report revokes coverage on the next scan

  Scenario: late passing evidence reaches the assessor instead of becoming a false missing-test gap
    Given a checksum-verified report with hundreds of passing baseline tests
    And the passing acceptance assertion appears near the end of that report
    When the production readiness refresh supplies execution evidence to its assessor
    Then the late assertion is available for a coverage proposal
    And its omission is not misclassified as missing test implementation
    And the package, manual PASS records and explicit confirmation requirement are preserved

  Scenario: large-context refresh resumes after assessment failure and enables completion after confirmed coverage
    Given large executed reports and source excerpts with repeated context
    And current reviewed manual passes and completed code review
    When the final assessment fails after validated extraction
    Then completion remains blocked without inventing phase quality gaps
    When refresh is retried after an application restart
    Then validated extraction is reused only for the same sources, pack, outcomes and algorithm
    And lossless compaction preserves every selected identity, report binding and source occurrence
    And no model prompt exceeds the existing size bound
    When the complete coverage proposal is explicitly confirmed
    Then the phase gaps are cleared and Complete Feature becomes enabled
    And the manual caption becomes complete without rewriting reviews or passing results

  Scenario: readiness activity is visible on the owning feature card until settlement
    Given a readiness assessment running under its server-owned feature lock
    When the assessment starts
    Then a project-change notification reloads the owning feature card
    And the card shows a spinning Refreshing readiness status instead of Idle or Completion blocked
    When the assessment succeeds or fails
    Then the lock is released before the settlement notification
    And the card returns to its current settled status
    And a competing rejected refresh does not clear the active indicator
    And completed or cancelled features ignore stale recovery activity

  Scenario: invalid assessment checkpoints cannot establish coverage
    Given a damaged, incomplete or stale saved assessment stage
    When readiness refresh attempts to resume that stage
    Then its saved response is revalidated and invalid stages are rerun
    And no partial proposal or human approval is inferred

  Scenario: long and supplemental reports preserve executable evidence
    Given long test identities exceeding a single context excerpt
    Or a supplemental report following a large primary report
    When recovery imports the verified execution reports
    Then acceptance assertions remain available regardless of their report position

  Scenario: changing a saved manual outcome during assessment prevents stale coverage publication
    Given a refresh assessing current saved manual outcomes
    When a manual result changes before the assessment returns
    Then no stale coverage proposal is published

  Scenario: unverified or superseded execution never clears a gap
    Given discovered-only tests or failed, empty, checksum-mismatched or unproven prebuilt reports
    When readiness refresh imports execution evidence
    Then those reports do not establish acceptance coverage
    And a newer failure cannot be hidden by an older pass
    And repeated receipts are not counted as additional tests

  Scenario: stale ledger summaries do not create false outstanding work
    Given an unchecked ledger task with a unique matching completed task section and completion timestamp
    When readiness reconciles the current phase evidence
    Then that stale checkbox does not create a quality gap
    But ambiguous identities or missing completion evidence remain unresolved

  Scenario: Static command sequence captures its final output without changing execution
    Given a configured static check contains literal commands joined by AND
    And the receipt binds an additional terminal audit log to the current run
    When HEPHA imports the unchanged sequence and its recorded exit status
    Then successful execution is accepted without inventing test coverage
    And a failed command remains unresolved
    And changing the sequence control flow is rejected

  Scenario: Recovery messages and controls stay with their owners
    Given a feature has unresolved checks and an artifact error in a declared phase document
    And another diagnostic belongs to the feature document
    When completion readiness is displayed
    Then repair controls and the phase artifact diagnostic appear in the owning phase
    And feature readiness shows the summary and feature diagnostic without duplicate phase controls
    And manual verification guidance appears beside the manual controls
    And no gate is waived by placing its message

  Scenario: Manual-pack freshness and unrelated gates do not suppress coverage inspection
    Given current execution evidence and an outdated or absent manual pack
    And a separate phase or artifact issue still needs resolution
    When completion readiness assesses acceptance coverage
    Then the coverage model inspects the available evidence
    And stale manual passes are excluded from current evidence
    And the independent completion blockers remain unresolved
