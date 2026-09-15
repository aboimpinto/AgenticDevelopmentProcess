# Following a PR through Greptile review

This is the maintainer's standing workflow for HEPHA, including dependency and
documentation PRs. Keep one focused PR per problem; when an appropriate PR
already exists, fix and follow that PR rather than opening a duplicate.

The [product PR delivery lifecycle](../workflow/pr-delivery-lifecycle.md) respects
this repository policy when the target is HEPHA itself. Other managed projects
retain their own configured review requirements.

## Review loop

1. Inspect the diff, approved scope, compatibility impact and meaningful test
   evidence. Publish an accurate PR description, including checks not executed.
2. Record the current head commit. Inspect GitHub checks, the discussion, submitted
   reviews and every inline thread, including resolved or outdated threads whose
   proposed fixes still need verification. Use `gh pr view`, `gh pr checks`, the
   REST discussion/review endpoints and GraphQL `reviewThreads` with pagination.
3. Wait for Greptile to complete its review of that head. If it has not started,
   request it with a PR comment mentioning `@greptileai`. Do not repeatedly post
   identical requests while a review is queued. Check the review's commit ID,
   check-run SHA or an explicit bot reference to the reviewed head; timestamps
   alone do not prove coverage. A completed no-findings review is valid evidence;
   silence is not.
4. Assess each finding against the code and agreed contract. Apply justified
   fixes with appropriate regression coverage. For false positives, explain the
   counter-evidence in the thread. For suggestions outside the agreed scope,
   record a linked follow-up or lessons-learned entry for later
   EPIC -> FEAT -> PHASE -> TASK -> CODE planning. Do not label a real regression,
   security flaw or broken existing contract an optional new requirement.
5. Push fixes, run the affected checks and request another Greptile review when
   automatic review has not started. Explain the fix and verification in the
   relevant thread. Resolve threads only after a fix is verified or a reasoned
   disposition is recorded. A resolved thread is not itself proof of a fix.
6. Before merging, confirm the head has not changed, required checks pass, the
   current Greptile review is complete, actionable findings are addressed and
   conversations have a recorded disposition. Follow repository protection and
   the user's merge authorization; never use an administrator bypass. Automated
   review does not establish that a human performed manual review or testing.
7. After an authorized merge, verify its state and linked issue closure. Report
   any new Dependabot batch separately from the PRs just completed.

## If review does not arrive

Inspect the app's check/status output and bot comments. Confirm HEPHA is enabled
inside Greptile as well as allowed in the GitHub App installation. Check draft,
author (including Dependabot), branch, label and file filters, and whether review
on new commits is enabled. Repository configuration and dashboard settings can
both affect review. Do not assume installed means a review has run.

Continue independent fixes and verification while waiting, with periodic status
updates. If the app reports a limit, missing access, disabled repository or other
external failure, record the reason and required owner action, leave the PR open,
and report the blocker. Do not treat elapsed time or unavailable review as a pass.
No credentials or private dashboard contents belong in a public PR.

## Durable evidence

Keep a concise PR comment or description recording the reviewed head, Greptile
review link, findings and their dispositions, checks and limitations. Sign public
messages according to the contributor's applicable workspace instructions. Do
not commit raw review dumps, credentials, generated test reports or runtime logs.

The official [Greptile quickstart](https://www.greptile.com/docs/quickstart) covers
repository enablement and manual review requests. The
[configuration reference](https://www.greptile.com/docs/code-review/greptile-config-reference)
describes filters and review-on-update settings.
