---
name: workflow-commit
description: "Workflow Utility: stage changes and commit with a single-line message — Conventional Commits or Task-ID-prefixed, following the repo"
argument-hint: "[--push] [--dry-run] [--breaking] [description override]"
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git log:*), Bash(git push:*), Bash(git diff:*), Bash(git branch:*), Bash(cat:*), Bash(grep:*), Bash(ls:*)
model: sonnet
disable-model-invocation: true
---

# Commit (Task-ID)

A **Workflow Utility**: create one clean commit for the current changes, carrying the branch's
Task ID in whichever form the repo uses — a `TASK-ID:` prefix, or the scope of a Conventional
Commit. Lightweight companion to `/workflow-release` (which does the heavier SemVer bump,
changelog, tag, and push).

## Input

$ARGUMENTS

Parse these flags from the input:

- `--dry-run` — do everything except commit/push: show the exact message and the staged file list, then stop.
- `--push` — after a successful commit, push the current branch to its upstream.
- `--breaking` — mark this as a breaking change: `!` in the subject and a `BREAKING CHANGE:` footer. Conventional style only.
- Any remaining free text is treated as an explicit description override (use it instead of auto-generating the description).

## Instructions

1. **Identify the Task ID.** Read the current branch (`git branch --show-current`) and extract a Task ID matching `[A-Z]{2,}-\d+` (e.g. `PROJ-123`, `TASK-456`, `ISSUE-987`, `TKT-654`).
   - If the branch has none, optionally check readily-available IDE/task info (`.idea/workspace.xml`) or a configured issue tracker (e.g. GitLab MCP) **only if obviously present** — never block waiting on it.
   - If no Task ID can be found, proceed **without** a prefix and say so in the summary.

2. **Stage changes.** Run `git status`; if there is nothing to commit, stop and say so. Otherwise `git add -A` (or stage the relevant files).

3. **Review the staged diff.** Run `git diff --cached` and understand WHAT changed and WHY.

4. **Detect the commit style.** Decide the format before composing. Check in order:

   - **A commitlint config** — `ls -a | grep -iE '^\.?commitlint'`, plus `grep -l '"commitlint"' package.json 2>/dev/null` (the redirect matters — most repos have no `package.json`, and the bare form writes an error and exits 2). Any hit settles it: **conventional**. A config is what the repo intends to enforce and wins over history, even where older commits predate it.
   - **Recent history** — `git log -20 --format='%s'`. **Conventional** when most subjects match `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: `. Read "most" as 60% **of the subjects that came back**, not of 20 — a young repo returns fewer, and an absolute count would leave a repo whose every commit is conventional undetectable until its twelfth. Under 3 commits there is no signal either way.

     History that fails to clear that bar proves nothing. It does **not** select house style — it means this check did not decide, and the next one runs.

   - **Nothing returned *conventional*** — **STOP and ask before composing anything:**

     `No commit convention detected. Use Conventional Commits (type(scope): description)? (y/N)`

     A repo whose history is entirely `TASK-ID: …` lands here every time. That is the designed path, not an edge case — and reading unmatched history as a vote for house style is the specific mistake this gate exists to prevent. Do not compose, do not stage-report, do not commit until the question is answered.

   Ask every time. Do not record the answer — not in the scratchpad, not in a config, not in session memory. A repo that has not adopted the convention should keep being offered it, and re-asking is cheaper than state that goes quietly stale.

5. **Compose ONE single-line message.**

   **House style** (conventional not in use) — unchanged: `TASK-ID: <concise what & why>`, or just `<concise what & why>` if no Task ID. Imperative mood, ≤ ~72 chars where reasonable.

   **Conventional style** — `type(TASK-ID): <description>`, the Task ID as the scope. With no Task ID, drop the parentheses entirely: `type: <description>`, never `type(): …`.

   | Change | Type |
   |---|---|
   | New capability | `feat` |
   | Defect fix | `fix` |
   | Documentation only | `docs` |
   | Restructuring with no behaviour change | `refactor` |
   | Performance | `perf` |
   | Tests only | `test` |
   | Build, dependencies, tooling | `build` |
   | CI configuration | `ci` |
   | Maintenance not covered above | `chore` |
   | Reverting an earlier commit | `revert` |

   Judge the type by what the change *does*, not by the file extension it lives in. In a repo whose product is prose — a prompt library, a rules pack, a docs site — editing markdown is `feat` or `fix`, and `docs` is reserved for writing *about* the product, like a README. Defaulting every markdown edit to `docs` produces a changelog in which nothing ever happened.

   The description is lowercase, imperative, no trailing period. Keep the whole subject ≤ ~72 characters; `feat(PROJ-123): ` already spends 16 of them.

   If a description override was passed, use it verbatim in place of the generated text: after the `TASK-ID:` prefix in house style, or as the description inside `type(scope):` in conventional style.

   Do **NOT** include a `Co-authored-by` line.

6. **Breaking changes.** When `--breaking` is passed, mark it both ways the spec allows — `!` before the colon, and a footer:

       feat(PROJ-123)!: drop the legacy retry path

       BREAKING CHANGE: <what broke, and what callers must do instead>

   Ask for the footer text when the diff does not make it self-evident; that line is the part a reader acts on.

   Raise the question unprompted when the diff removes or renames something callers depend on — a public function, a flag, a config key, a file others reference by path. Suggest it, never assume it: ask once and take the answer.

   In house style `--breaking` has nothing to attach to. Say it was ignored rather than dropping it silently.

7. **Dry-run gate.** If `--dry-run` was passed, print the composed message and the staged file list, then STOP — do not commit.

8. **Commit** with the composed message. Confirm success with `git log -1 --oneline`.

9. **Push (optional).** If `--push` was passed, run `git push` and confirm.

10. **Summary.** Report the Task ID used (or "none"), the style used (conventional or house), the final message, and whether it was pushed.
