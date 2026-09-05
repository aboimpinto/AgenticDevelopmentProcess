# @aboimpinto/pi-skill-hepha-continue-implementation

Pi skills for running HEPHA EPIC submission plus FEAT Deep-Dive, design,
refinement, and implementation workflows from a parent workspace, without
needing to click the dashboard.

Install from the HEPHA repository root:

```bash
pi install ./pi-packages/pi-skill-hepha-continue-implementation
```

Submit a new EPIC directly from the console:

```bash
pi --approve "Use the submit-epic skill for HEPHA: add workflow event projection hooks."
```

Then start a READY FEAT and let it continue autonomously:

```bash
pi --approve "Use the start-feature skill for HEPHA FEAT-003 autonomous."
```

Invoke implementation continuation for a FEAT that is already in progress:

```bash
pi --approve "Use the continue-implementation skill for HEPHA FEAT-002 autonomous."
```

Gather a FEAT Deep-Dive question round:

```bash
pi --approve "Use the deep-dive skill for HEPHA FEAT-004."
```

Create UI design artifacts for a FEAT:

```bash
pi --approve "design-feature FEAT-004"
```

Refine a FEAT and move it to Ready To Develop:

```bash
pi --approve "refine-feature FEAT-004"
```

Invoke finalization directly after human gates are accepted:

```bash
pi --approve "Use the complete-feature skill for HEPHA FEAT-002."
```

Calling `complete-feature` is the explicit acceptance that human code review and
manual tests have been completed or accepted. The skill still verifies phase
state, review/finding evidence, final checks, git merge/push, MemoryBank folder
movement, linked EPIC completion/progress, feature worktree cleanup,
LessonsLearned, and optional HEPHA SQLite metadata cleanup.

Do not combine this workflow with `--no-tools`; Pi needs at least read/search
tools to load the selected skill and inspect the workspace. For a read-only
smoke test, use:

```bash
pi --offline --tools read,ls,grep \
  "Use the continue-implementation skill for HEPHA FEAT-002 autonomous. Smoke test only: do not edit files."
```

The submit-epic skill resolves the HEPHA project, finds its MemoryBank, reads
existing EPICs/features for duplicate detection and context, assigns the next
`EPIC-XXX` id from `NEXT_EPIC_ID.txt`, creates the EPIC folder under
`00_EPICS`, writes `EpicDescription.md`, and increments the counter. It mirrors
the legacy DevCycle MCP `submit-epic` command while using Hepha's current EPIC
field names and implementation-posture guidance.

The start-feature skill resolves the HEPHA project, finds its MemoryBank,
locates a READY or already moved FEAT folder, creates or confirms the
implementation branch, moves READY work to `03_IN_PROGRESS`, writes start
evidence, and in autonomous mode continues numbered phases. For code-relevant
phases it requires code review, fixes blocking findings, and reruns review until
blocking issues are cleared or a real blocker remains.

The continue-implementation skill resolves the same project context, identifies
the first unresolved numbered phase, and continues phases in order until all are
complete/skipped or a real blocker is reached.

The deep-dive skill resolves the same project context and supports the two
HEPHA Deep-Dive stages: gathering the question round first, then applying saved
answers to `FeatureDescription.md` or `EpicDescription.md` without starting
implementation work. When it is run directly from the console and updates the
source document, it also syncs HEPHA SQLite metadata when `.hepha/hepha.sqlite`
is available, so the dashboard can treat the direct Deep-Dive as current.

The design-feature skill creates `UX-research-report.md`,
`Wireframes-design.md`, and `design-summary.md` in the FEAT folder without
moving the FEAT or creating implementation tasks.

The refine-feature skill creates `FeatureTasks.md`, numbered phase files, and
then moves the FEAT from `01_SUBMITTED` to `02_READY_TO_DEVELOP` when the
handoff is complete.

The complete-feature skill resolves the same project context, confirms the FEAT
is ready to finalize, writes completion/LessonsLearned evidence, commits and
pushes the implementation branch, merges to `master`, moves the FEAT folder to
`04_COMPLETED`, updates linked EPIC progress and marks the EPIC complete when
all child FEATs are completed, removes the feature worktree when one was used
and it is safe to remove, pushes `master`, and clears stale HEPHA workflow
metadata when SQLite is available.

## Skills

- `submit-epic`
- `deep-dive`
- `design-feature`
- `refine-feature`
- `start-feature`
- `continue-implementation`
- `complete-feature`
