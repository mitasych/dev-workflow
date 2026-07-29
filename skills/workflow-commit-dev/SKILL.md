---
name: workflow-commit-dev
description: "Workflow Utility: commit using the VERSION from .version and create a matching dev/RC tag"
argument-hint: "[--push] [--dry-run]"
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git tag:*), Bash(git log:*), Bash(git push:*), Bash(git diff:*), Bash(git branch:*), Bash(cat:*), Bash(grep:*)
model: sonnet
disable-model-invocation: true
---

# Commit (dev / version)

A **Workflow Utility**: commit the current changes as a versioned dev build and create the
matching dev tag. Driven by the project's `.version` file. Distinct from `/workflow-release`,
which produces real SemVer release tags.

## Input

$ARGUMENTS

Parse these flags from the input:

- `--dry-run` — show the version, the commit message, and the exact tag command(s), then stop.
- `--push` — after committing and tagging, push the branch and the new tag.

## Instructions

1. **Read the version.** Look for `.version` or `app/.version` and read the `VERSION` value — call it `{VersionValue}`. If neither file exists or no VERSION is set, STOP and report it (this command is version-file driven).

2. **Detect the branch.** Get the current branch (`git branch --show-current`). If it matches `RC-{n}` or `test-RC-{n}`, capture `{rcNumber}`.

3. **Stage changes.** Run `git status`, then `git add -A`. It is fine if only the version file changed.

4. **Review the staged diff.** Run `git diff --cached`.

5. **Compose the commit message:**
   - Base: `Version {VersionValue}`.
   - If files **other than** the version file changed, append a brief single-line description of WHAT changed and WHY: `Version {VersionValue} — <what & why>`.
   - Do **NOT** include a `Co-authored-by` line.

6. **Determine the tag:**
   - Default: `dev-{VersionValue}`.
   - If on `RC-{n}` / `test-RC-{n}` **and** `{VersionValue}` does not already contain `rc{rcNumber}`: use `dev-rc{rcNumber}-{VersionValue}`.
   - Tag command: `git tag -a "<tag>" -m "v_<tag>"`.

7. **Dry-run gate.** If `--dry-run` was passed, print the version, the commit message, and the exact `git tag` command, then STOP.

8. **Commit** with the message; confirm with `git log -1 --oneline`.

9. **Tag** using the command from step 6; confirm with `git tag -l "<tag>"`.

10. **Push (optional).** If `--push` was passed, run `git push` and `git push origin "<tag>"`; confirm.

11. **Summary.** Report the version, commit message, the tag created, and whether it was pushed.
