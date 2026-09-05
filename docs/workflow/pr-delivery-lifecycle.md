# PR Delivery Lifecycle

Some FEATs should complete through a pull request instead of direct merge to
`master`. This lifecycle makes that choice explicit on the FEAT and keeps
GitHub review and CI state visible before final completion.

## Delivery Policy

Each implementation FEAT should carry a durable delivery section in
`FeatureDescription.md`:

```md
## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | direct_merge |
| Target Branch | master |
| GitHub Issue | - |
| Issue Role | - |
| Issue Update Mode | comment |
| Pull Request | - |
| Delivery Status | configured |
```

Supported delivery modes:

- `direct_merge`: Complete Feature commits, pushes, merges the implementation
  branch into the target branch, pushes the target branch, and moves the FEAT
  to `Features/04_COMPLETED`.
- `pull_request`: after implementation phases, user code review, and manual
  tests are complete, Hepha creates or updates a PR automatically and leaves the
  FEAT in `Features/03_IN_PROGRESS` until PR completion gates pass.
- `commit_only`: future option for documentation-only or local-only work where
  no remote merge or PR should happen.

If the delivery section is missing, Hepha should default to `direct_merge` for
backward compatibility, but the dashboard should make the implicit default
visible.

## PR Creation Trigger

For `pull_request` delivery, recording both `User Code-Review` and `Manual
Tests` is approval for Hepha to prepare the PR, not to complete the FEAT.

The PR creation trigger requires:

- FEAT is in `Features/03_IN_PROGRESS`.
- Every numbered implementation phase is `COMPLETED` or `SKIPPED`.
- `User Code-Review` is recorded.
- `Manual Tests` is recorded.
- All local Human Review Findings are closed or accepted by the user.
- Delivery Mode is `pull_request`.
- GitHub issue is linked, or the user has explicitly requested Hepha to create
  one from the FEAT.

PR creation should:

- push the implementation branch;
- create a PR against the target branch;
- link the GitHub issue in the PR body;
- comment on the issue, or update a matching checklist item when a safe
  `FEAT-###` checklist target is found;
- write the PR URL and delivery status back to `FeatureDescription.md`;
- keep the FEAT in `Features/03_IN_PROGRESS`.

## Issue Linking

The linked issue can have different roles:

- `feature_issue`: the PR may use `Closes #123`.
- `tracking_issue`: the PR should use `Refs #123`.
- `epic_issue`: the PR should use `Refs #123` and may update a checklist item
  matching the FEAT ID.

Issue body updates should be conservative:

1. If an unchecked checklist item contains the FEAT ID, check that item.
2. Otherwise, add a comment with the PR link and FEAT summary.
3. Do not rewrite arbitrary issue body text without a precise target.

## Manual PR Feedback Sync

The FEAT detail panel should expose a manual `Fetch PR Feedback` action when a
PR is linked.

That action should read:

- unresolved PR review threads;
- review states, including `CHANGES_REQUESTED`, approval, and comments;
- PR comments that are not inline review threads;
- current CI/check status and failed job names;
- mergeability and whether the PR is already merged.

The result becomes a PR feedback ledger on the FEAT:

- review thread ID or comment ID;
- author;
- file and line when available;
- current state: `open`, `fixing`, `replied`, `resolved`, `accepted-risk`;
- summary of the requested change;
- link back to the GitHub thread or comment;
- latest CI/check status.

## Fix PR Feedback

PR feedback repair should be explicit, not automatic on every refresh. The user
starts it with a button such as `Fix PR Feedback`.

The repair workflow should:

- fix unresolved PR review comments and failed CI checks;
- run the smallest relevant validation first, then broader checks as needed;
- reply to each handled review thread with what changed and evidence;
- resolve review threads only after the fix is present and verified;
- leave accepted-risk or not-applicable comments unresolved unless the user
  explicitly accepts them.

CI failures should be treated as feedback too. If a GitHub Actions check is red,
Hepha should fetch the failing job summary or logs, diagnose the cause, fix it,
and update the ledger with evidence.

## Complete Feature Gate With PRs

For `pull_request` delivery, `Complete Feature` is allowed only when one of
these is true:

- the PR is already merged; or
- the PR is approved, no unresolved blocking review threads remain, required
  checks are green, and Hepha is allowed to merge it.

Completion then:

- merges the PR if it is approved but not yet merged;
- verifies the target branch contains the FEAT work;
- moves the FEAT folder to `Features/04_COMPLETED`;
- records the final completion report and LessonsLearned;
- syncs linked EPIC state.

If review comments remain open, a required check is red, the latest review is
`CHANGES_REQUESTED`, or mergeability is blocked, Complete Feature must remain
disabled and show the blocker.

## UI Surface

The FEAT detail panel should show a `Delivery` section:

- delivery mode segmented control: `Direct Merge` / `Pull Request`;
- target branch;
- GitHub issue link;
- create issue from FEAT action;
- PR URL and state;
- CI state;
- review feedback count;
- actions: `Fetch PR Feedback`, `Fix PR Feedback`, `Complete Feature`.

The Work Board card can show compact badges:

- `PR READY`: PR mode configured but no PR exists yet.
- `PR OPEN`: PR exists and awaits review/checks.
- `PR BLOCKED`: open comments or red CI.
- `PR MERGEABLE`: reviews/checks are green.
- `PR MERGED`: ready for final FEAT completion.
