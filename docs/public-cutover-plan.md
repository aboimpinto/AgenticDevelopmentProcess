# Public Repository Cutover Plan

This plan converts the existing private HEPHA repository into a public MIT
repository while preserving its owner, name, and final URL. Gate 4, the private
repository replacement, completed on 2026-09-06 after explicit human approval.
The repository remains private; public visibility still requires the separate
Gate 5 approval.

## Recovery baseline

The final pre-cutover repository and stopped local runtime are archived outside
the workspace at:

```text
~/.local/share/hepha-private-archives/
  AgenticDevelopmentProcess-2026-09-06-final-pre-cutover.bundle
  AgenticDevelopmentProcess-2026-09-06-local-runtime.tar.gz
```

Their verified SHA-256 values are:

```text
977fa18d093b55389129e09255c73214f5315d6b6446726ab5d1c49c8229212c
19a96418d492d73db2a4cc7ae1fc2a19b6cfbfa55625034c0bbaf8f9127d0703
```

The bundle contains the repository refs that existed immediately before the
private cutover, including the working repository's branch, stash, and remote
tracking refs. The runtime archive contains the stopped local SQLite state.
Keep both archives private.

## Public-tree contract

`public-release-manifest.json` is the source of truth for the first public
root. The public projection keeps product source, tests, documentation,
governance files, selected feature contracts, active lessons, and architectural
overviews. It excludes runtime databases, generated PDFs, private screenshots,
phase/task execution records, review ledgers, and other operational MemoryBank
history.

Run these checks from the repository root:

```bash
pnpm release:audit
pnpm release:prepare -- --target <empty-directory-outside-the-repository>
```

The release audit fails on forbidden private markers, unreviewed
credential-shaped strings, symbolic links, missing required files, or broken
local Markdown links in the prepared tree. Known synthetic security-test
fixtures are allowed only by their exact SHA-256 fingerprints.

## Approval gates

### Gate 1: local release candidate

1. Export the curated tree to a new empty directory outside the repository.
2. Initialize a new local Git repository on `master` in that directory.
3. Create one clean root commit.
4. Run installation, type checking, tests, build, and the release audit from
   the candidate.
5. Inspect the commit tree and verify that it has no parent and no old refs.

This gate is local and reversible. It does not affect GitHub.

### Gate 2: human content and legal review

1. Review the README, screenshots, example data, retained MemoryBank content,
   contribution model, security policy, and governance documents.
2. Run a dedicated secret scanner against both the current complete history
   and the clean candidate.
3. Review dependency licenses and confirm that all released code and content
   may be distributed under MIT.
4. Replace or explicitly approve every screenshot that shows real project data
   or local paths.

The maintainer explicitly decides whether the candidate is ready for the
irreversible remote steps.

### Gate 3: GitHub metadata decision

Review Actions runs and artifacts that can expose old paths or historical
content. Review issues whose commit links will no longer resolve, repository
variables, secrets, webhooks, deploy keys, environments, collaborators, and
installed applications. Do not copy secret values into audit output.

The 2026-09-06 audit found 12 GitHub-managed pull-request refs from six
Dependabot PRs, 417 Actions runs, 732 Actions artifacts, and one issue that
links to an old commit. It found no repository Actions secrets, variables,
webhooks, deploy keys, environments, or outside collaborators. GitHub-managed
`refs/pull/*` cannot be deleted with a normal branch cleanup or force-push and
would retain the old ancestry if the existing repository were made public.

### Gate 4: remote history replacement

The preferred cutover is to recreate the repository under the same owner and
name while it remains private. This changes the GitHub repository identity but
preserves the final URL and avoids retaining GitHub-managed pull refs, cached
commit pages, Actions artifacts, and other unreachable objects from the old
history.

With separate explicit approval:

1. Verify the current private recovery bundle and create a second bundle of the
   final pre-cutover state.
2. Back up the stopped local HEPHA runtime database separately so it can remain
   local and ignored after the source checkout moves to the public root.
3. Delete the private GitHub repository.
4. Recreate `aboimpinto/AgenticDevelopmentProcess` immediately as a private,
   empty repository without an initialized README, licence, or `.gitignore`.
5. Push only the reviewed one-commit public candidate to `master`.
6. Confirm that the remote initially exposes one branch, one root commit, no
   pre-cutover pull refs, no pre-cutover Actions history, and no old issues or
   artifacts. New Dependabot branches and Actions runs may be created from the
   clean root immediately after the push.
7. Fresh-clone the repository into a new directory and repeat the release
   audit, install, typecheck, tests, build, and synthetic-demo verification.
8. Point the canonical local checkout at the new public root without restoring
   old Git refs. Restore only the ignored local runtime state needed by HEPHA.

A force-update of the existing repository is acceptable only if GitHub Support
first confirms removal of the old pull refs, cached views, and retained objects.
Closing PRs and deleting their source branches is not sufficient.

Keep the repository private throughout this gate. If verification fails,
restore from the bundle or correct the candidate before continuing.

Gate 4 completed on 2026-09-06. The recreated private repository started from
root commit `2889c3a2505ba49783163bda43d66c98feb1ba8e`. Sampled old commits and
all pre-cutover pull refs were unreachable. A fresh clone passed the release
audit, Gitleaks scan, install, typecheck, 6,160 tests, production build,
synthetic-demo generation, and demo verification. GitHub CI run `33996079494`
also passed. The canonical checkout now tracks the clean root, and only ignored
local runtime state was restored.

### Gate 5: public launch

With final explicit approval, enable private vulnerability reporting, configure
the available branch/ruleset protections, then change visibility to public.
Create a public-alpha release with known limitations. Only after the public URL
and fresh clone are verified should HEPHA be introduced to other communities.

## Rollback

Before public visibility, rollback means force-restoring the private remote
from the verified bundle and recreating any required branches. After public
visibility, deleted history must be treated as potentially copied and cannot be
made private again by changing visibility. This is why publication is the last,
separately approved gate.
