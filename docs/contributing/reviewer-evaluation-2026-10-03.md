# Greptile and Kodus: first HEPHA evaluation

This is an initial observation from dependency and documentation PRs, not a
benchmark of application-code review quality. Review dates: 2026-10-03.

## Verified results

| PR | Kodus reviewed commit | Result and limitation |
| --- | --- | --- |
| [#61: jsdom](https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/61#issuecomment-5971195092) | `2c049e4d` | No findings. Greptile also found no outstanding issue on this head. Kodus's initial file inventory listed the lockfile, not the changed manifest. |
| [#65: review procedure](https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/65#issuecomment-5971195215) | `0ad1de40` | No findings. Greptile also found no outstanding issue on this head. An earlier Greptile finding had already been fixed before Kodus reviewed it. |
| [#62: Vite](https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/62#discussion_r4174008120) | Check run: `2d16738c` | Correctly identified unresolved merge markers and their install/build impact. The markers were repaired before the review finished. The posted inline comment was attached to newer head `83a0d04e`, although its text described the earlier snapshot. |
| [#63: Lucide](https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/63) | `1a94e208` | No findings. Later integration commits needed fresh review; the earlier result is not approval of those commits. |
| [#64: Node typings](https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/64) | `42a2fb8b` | No findings. Later integration commits needed fresh review; the earlier result is not approval of those commits. |

Kodus completed five reviews: four no-findings results and one confirmed defect.
The Vite finding is a true positive on the earlier commit, already repaired, not
a false positive. Its commit association demonstrates why both the check-run
SHA and the content of a finding need inspection.

Greptile identified two useful gaps during this batch:

- [Ambiguous Kodus merge policy in #65](https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/65#discussion_r4173919780): fixed by explicitly distinguishing advisory Kodus evaluation from the required Greptile review.
- [Missing diagram browser CI coverage in #66](https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/66#discussion_r4173938792): the DOMPurify security update affects Mermaid sanitization. The existing five rendering/recovery tests passed locally and were added to CI.

Those findings were fixed before Kodus could evaluate the same defective states.
They cannot be counted as Kodus misses. Greptile's review of the transient broken
Vite merge was cancelled, so there is no completed matched comparison of that
state either. Neither defect-detection recall nor relative quality can be
established from this batch.

## Integration observations

- GitHub App access to all repositories did not select HEPHA inside Kodus.
  Selecting `aboimpinto/AgenticDevelopmentProcess` in Kodus's Git repository
  setup enabled review. `DevelopmentProcess` is a different repository.
- [Kodus's published defaults](https://github.com/kodustech/kodus-ai/blob/main/default-kodus-config.yml)
  exclude `package.json` and `**/*.json`. The observed jsdom file inventory is
  consistent with those exclusions. Compare actual file coverage and configure
  relevant manifests for review; do not infer full coverage from a green check.
- Kodus replaced #65's author-written PR description, including its validation
  evidence and signature, with a generated summary. The description was restored.
  Preserve authored evidence when configuring PR summaries.
- After these five reviews, Kodus reported its trial review allocation exhausted.
  Later checks were skipped and requested an AI provider key. Skipped reviews are
  unavailable evidence, not no-findings results. No paid configuration was changed.

## Next comparison

Use the same stable commits, comparable file filters and recorded check-run SHAs.
For future application-code PRs, assess verified defects, incorrect suggestions,
coverage, stale findings and the effort needed to act on each review. Preserve
ordinary CI and maintainer review; confidence scores, comment counts and clean
reviews alone do not establish equivalent quality.
