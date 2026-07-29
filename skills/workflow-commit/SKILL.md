---
name: workflow-commit
description: "Workflow Utility: stage changes and commit with a single-line, Task-ID-prefixed message"
argument-hint: "[--push] [--dry-run] [description override]"
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git log:*), Bash(git push:*), Bash(git diff:*), Bash(git branch:*), Bash(cat:*), Bash(grep:*)
model: sonnet
disable-model-invocation: true
---

# Commit (Task-ID)

A **Workflow Utility**: create one clean commit for the current changes, prefixed with the
branch's Task ID. Lightweight companion to `/workflow-release` (which does the heavier
SemVer bump, changelog, tag, and push).

## Input

$ARGUMENTS

Parse these flags from the input:

- `--dry-run` — do everything except commit/push: show the exact message and the staged file list, then stop.
- `--push` — after a successful commit, push the current branch to its upstream.
- Any remaining free text is treated as an explicit description override (use it instead of auto-generating the description).

## Instructions

1. **Identify the Task ID.** Read the current branch (`git branch --show-current`) and extract a Task ID matching `[A-Z]{2,}-\d+` (e.g. `PROJ-123`, `TASK-456`, `ISSUE-987`, `TKT-654`).
   - If the branch has none, optionally check readily-available IDE/task info (`.idea/workspace.xml`) or a configured issue tracker (e.g. GitLab MCP) **only if obviously present** — never block waiting on it.
   - If no Task ID can be found, proceed **without** a prefix and say so in the summary.

2. **Stage changes.** Run `git status`; if there is nothing to commit, stop and say so. Otherwise `git add -A` (or stage the relevant files).

3. **Review the staged diff.** Run `git diff --cached` and understand WHAT changed and WHY.

4. **Compose ONE single-line message** in the form `TASK-ID: <concise what & why>` (or just `<concise what & why>` if no Task ID). Imperative mood, ≤ ~72 chars where reasonable. If a description override was passed, use it verbatim after the prefix.
   - Do **NOT** include a `Co-authored-by` line.

5. **Dry-run gate.** If `--dry-run` was passed, print the composed message and the staged file list, then STOP — do not commit.

6. **Commit** with the composed message. Confirm success with `git log -1 --oneline`.

7. **Push (optional).** If `--push` was passed, run `git push` and confirm.

8. **Summary.** Report the Task ID used (or "none"), the final message, and whether it was pushed.
