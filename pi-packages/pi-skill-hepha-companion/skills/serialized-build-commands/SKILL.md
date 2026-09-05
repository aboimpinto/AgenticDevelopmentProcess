---
name: serialized-build-commands
description: Agents should invoke this skill before running build, test, lint, or format commands that use shared caches, file locks, build directories, or package manager state. Use especially before Rust Cargo commands such as cargo check, cargo test, cargo clippy, cargo fmt, cargo build, or any shell command containing cargo.
---

# Serialized Build Commands

Use this skill to avoid corrupting or blocking project validation by batching commands that share locks or build state.

## Cargo Rule

When a command contains `cargo` or `cargo.exe`:

- Emit at most one tool call containing Cargo in a single assistant response.
- Put exactly one Cargo invocation in that shell command.
- Wait for the tool result before deciding the next Cargo command.
- Inspect the result before continuing.
- Do not run Cargo commands in parallel.
- Do not combine Cargo commands with `&&`, `;`, `&`, `wait`, `xargs`, shell loops, subshell batching, or multiple tool calls in the same assistant response.
- Do not start another Cargo command while one is still running.

If multiple Cargo checks are required, run them as separate turns:

1. Run one Cargo command.
2. Read the result.
3. Decide whether the next Cargo command is still needed.
4. Run the next Cargo command in a later assistant response.

## Lock Or Timeout Handling

If Cargo reports a file lock, blocked build directory, timeout, or interrupted command:

- Stop launching new Cargo commands.
- Inspect the process and repository state.
- Prefer the smallest focused command that verifies the specific failure after the blockage is resolved.
- Report a blocker if the lock cannot be resolved safely.

## Other Build Tools

Apply the same serialization rule to other tools when project lessons, logs, or failures show shared-state contention:

- `npm`, `pnpm`, `yarn`, `bun`
- `pytest`, `uv`
- `make`, `cmake`, `ninja`
- language-specific build or test runners with shared caches

Project instructions and LessonsLearned can make any of these rules stricter. Follow the stricter rule.
