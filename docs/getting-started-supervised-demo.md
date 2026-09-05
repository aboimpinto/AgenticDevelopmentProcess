# First Supervised Walkthrough

This walkthrough demonstrates HEPHA's human-in-the-loop product-decision flow
against a separate synthetic project. It stops after Deep-Dive updates the
feature document; the example intentionally contains no application to
implement or deploy.

## 1. Install HEPHA

Use Node.js 24 or newer and pnpm 11 or newer.

```bash
git clone https://github.com/aboimpinto/AgenticDevelopmentProcess.git
cd AgenticDevelopmentProcess
pnpm install
cp .env.example .env
```

## 2. Create the synthetic project

From the HEPHA repository, generate the example into an empty sibling
directory. The command copies the public template and the current managed
workflow assets; it does not copy HEPHA runtime databases or configuration.

```bash
pnpm demo:create -- --target ../hepha-supervised-demo
cd ../hepha-supervised-demo
git init -b master
git add --all
git commit -m "Initialize HEPHA supervised demo"
```

The generated project owns its architecture rule and a deliberately limited
document-verification profile. HEPHA-managed agents, commands, contexts,
schemas, skills, workflows, and generic safety policies are provisioned as a
local snapshot. Because this example has no application or executable
coverage, its profile intentionally does not satisfy implementation readiness;
that is why this walkthrough stops after Deep-Dive.

## 3. Start HEPHA

Return to the HEPHA checkout and start it when you are ready:

```bash
cd ../AgenticDevelopmentProcess
pnpm dev:all
```

Open <http://127.0.0.1:5173>. Configure a usable local or remote model
connection under **Models** before starting an agent-backed workflow. Provider
credentials remain local and must not be committed.

## 4. Register the demo

1. Open **Projects** and select **Add Project**.
2. Enter `HEPHA Supervised Demo` as the project name.
3. Enter the absolute path of the generated `hepha-supervised-demo` directory
   as **Project Root**.
4. Enter `MemoryBank` as **MemoryBank Path**.
5. Select **Save Project**, then open its FEAT board.

The board should show `FEAT-001 — Due-Date Filter` in Submitted. Its source is
`MemoryBank/Features/01_SUBMITTED/FEAT-001-due-date-filter/FeatureDescription.md`.

## 5. Run the human decision point

Open FEAT-001 and start its **Deep-Dive** or **Clarify** action. HEPHA should
focus on the two explicit `[NEEDS VALIDATION]` decisions:

- when a task becomes overdue; and
- whether the selected filter survives an application restart.

Review the recommendation and alternatives, choose deliberately, and complete
the question round. HEPHA should update `FeatureDescription.md`, remove the
resolved markers, and preserve the decisions in the project rather than only
inside an agent transcript.

Inspect the result from another terminal:

```bash
cd ../hepha-supervised-demo
git diff -- MemoryBank/Features/01_SUBMITTED/FEAT-001-due-date-filter/FeatureDescription.md
npm run verify
```

Commit the decision only if it matches your intent. Do not proceed to design,
refinement, or implementation for this documentation-only example.

## What this proves

- The work board is projected from portable project files.
- Ambiguity is visible and blocks later work.
- The agent recommends; the human decides.
- The result is a durable product artifact that can be reviewed in Git.
- Starting implementation remains a separate conscious action.

If the UI wording differs slightly, follow the action associated with the
Submitted FEAT's unresolved validation markers. HEPHA is early alpha and its
presentation may evolve before its workflow contracts stabilize.
