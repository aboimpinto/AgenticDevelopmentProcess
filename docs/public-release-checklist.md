# Public Release Checklist

Do not make the repository public based on documentation changes alone. Work
through this checklist immediately before changing repository visibility.

## Reversible preparation

- [x] Create and verify an offline Git bundle containing every current ref.
- [x] Define the curated public tree in `public-release-manifest.json`.
- [x] Add a repeatable public-tree exporter and release audit.
- [x] Prepare and audit a clean local release-candidate tree outside the
  working repository.
- [x] Review and explicitly approve Gate 4, the destructive private repository
  cutover, in [`public-cutover-plan.md`](public-cutover-plan.md). Gate 5 remains
  a separate approval.

## Repository data

- [x] Exclude local SQLite databases, logs, raw agent sessions, coverage output,
  and generated runtime artifacts from the clean public candidate.
- [x] Review the retained MemoryBank and example artifacts; keep the curated
  HEPHA product history and a small synthetic public example.
- [x] Search the complete Git history, not only the working tree, for API keys,
  tokens, passwords, and private keys.
- [x] Inspect the complete private history for local paths and private project
  material; retain it only in the private recovery archive and replace the
  remote with a clean root before publication.
- [x] Replace the remote history with the clean root. No credential rotation is
  indicated: all 18 complete-history Gitleaks detections were reviewed as
  synthetic test or redaction fixtures, and the clean candidate has zero.
- [x] Verify ignore rules cover nested project-local `.hepha` databases and
  transient files.

The 2026-09-06 Gitleaks 8.30.1 scan inspected every local ref. Its 18 findings
were manually classified as intentional redaction/security-test fixtures; the
clean candidate reported zero findings after those fixtures received explicit
inline annotations. The post-cutover fresh clone also reported zero findings.

The private cutover completed on 2026-09-06. The recreated repository started
at clean root `2889c3a2505ba49783163bda43d66c98feb1ba8e`; the old sampled commits
and pre-cutover pull refs were no longer reachable. GitHub CI run `33996079494`
passed type checking, web coverage, and all unit tests against that root.

## Documentation and community

- [x] Write a public product README with current screenshots.
- [x] Publish the mission, supervision model, roadmap, contribution guide, and
  security policy.
- [x] Add the MIT license and package metadata.
- [x] Add governance and code-of-conduct documents before actively inviting a
  broad contributor community.
- [x] Enable GitHub private vulnerability reporting immediately after the
  repository becomes public; GitHub does not expose this feature while the
  repository is private.
- [x] Apply the documented `master` protection policy after publication.
- [x] Add a public synthetic example and an end-to-end getting-started path.

## Screenshots

- [x] Review README screenshots for visible credentials and local paths.
- [x] Approve `01-project-portfolio.png` for publication with its visible local
  paths as an explicit maintainer decision.
- [x] Approve `03-deep-dive-question.png` for publication as an intentional
  real-project example, including its visible project name, requirements, and
  dependencies.
- [ ] Publish performance or delivery-acceleration figures only with a clear,
  reproducible measurement method.
- [ ] Replace legacy verification screenshots after the corrected evidence
  contract is implemented and validated.

See [`images/screenshots/README.md`](images/screenshots/README.md) for the
current image-by-image review.

## Build and legal

- [x] Reproduce installation, type checking, tests, and the production build
  from a fresh clone of the recreated private repository on Linux.
- [ ] Reproduce the principal supervised workflow from a fresh clone using
  synthetic example data. The synthetic demo generator and verifier pass, but
  the live HEPHA walkthrough remains pending while the maintainer keeps HEPHA
  stopped.
- [x] Confirm third-party dependency licences and required notices. The
  installed inventory is permissive; `khroma` omits package metadata but ships
  an MIT licence file.
- [x] Confirm the repository contains only code and content the project has the
  right to release under MIT. On 2026-09-06 the maintainer confirmed that the
  retained work was developed by the maintainer with LLM assistance and was
  not copied from another project.
- [x] Create the `v0.1.0-alpha.1` tagged prerelease with known limitations and
  migration notes.

## External outreach

- [x] Make the repository public after explicit maintainer approval. The
  maintainer accepted the pending live supervised walkthrough as an alpha
  limitation; the automated synthetic-demo verification passes.
- [ ] Open collaboration discussions with a concise comparison, concrete areas
  of shared interest, and links to reproducible HEPHA evidence.
- [ ] Do not copy code from another project unless its license permits it and
  attribution requirements are satisfied.
