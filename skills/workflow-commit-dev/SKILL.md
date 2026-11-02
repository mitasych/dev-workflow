---
name: workflow-commit-dev
description: "Workflow Utility: commit using the VERSION from .version and create a matching dev/RC tag"
argument-hint: "[--push] [--dry-run] [--breaking]"
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git tag:*), Bash(git log:*), Bash(git push:*), Bash(git diff:*), Bash(git branch:*), Bash(cat:*), Bash(grep:*), Bash(ls:*)
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
- `--breaking` — mark this as a breaking change: `!` in the subject and a `BREAKING CHANGE:` footer. Conventional style only.

## Instructions

1. **Read the version.** Look for `.version` or `app/.version` and read the `VERSION` value — call it `{VersionValue}`. If neither file exists or no VERSION is set, STOP and report it (this command is version-file driven).

2. **Detect the branch.** Get the current branch (`git branch --show-current`). If it matches `RC-{n}` or `test-RC-{n}`, capture `{rcNumber}`.

   Then extract a Task ID matching `[A-Z]{2,}-\d+` (e.g. `PROJ-123`, `TASK-456`) — it becomes the scope in conventional style. **Strip any `RC-{n}` / `test-RC-{n}` marker from the branch name before matching.** `RC-1` satisfies that pattern on its own, so an unguarded match turns the release-candidate counter into a ticket reference and commits `chore(RC-1): version …` on exactly the branches this skill exists to serve. If nothing else matches, proceed without a Task ID.

3. **Stage changes.** Run `git status`, then `git add -A`. It is fine if only the version file changed.

4. **Review the staged diff.** Run `git diff --cached`.

5. **Detect the commit style.** Decide the format before composing. Check in order:

   - **A commitlint config** — `ls -a | grep -iE '^\.?commitlint'`, plus `grep -l '"commitlint"' package.json 2>/dev/null` (the redirect matters — most repos have no `package.json`, and the bare form writes an error and exits 2). Any hit settles it: **conventional**. A config is what the repo intends to enforce and wins over history, even where older commits predate it.
   - **Recent history** — `git log -20 --format='%s'`. **Conventional** when most subjects match `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: `. Read "most" as 60% **of the subjects that came back**, not of 20 — a young repo returns fewer, and an absolute count would leave a repo whose every commit is conventional undetectable until its twelfth. Under 3 commits there is no signal either way.

     History that fails to clear that bar proves nothing. It does **not** select house style — it means this check did not decide, and the next one runs.

   - **Nothing returned *conventional*** — **STOP and ask before composing anything:**

     `No commit convention detected. Use Conventional Commits (type(scope): description)? (y/N)`

     A repo whose history is entirely `TASK-ID: …` lands here every time. That is the designed path, not an edge case — and reading unmatched history as a vote for house style is the specific mistake this gate exists to prevent. Do not compose, do not stage-report, do not commit until the question is answered.

   Ask every time. Do not record the answer — not in the scratchpad, not in a config, not in session memory. A repo that has not adopted the convention should keep being offered it, and re-asking is cheaper than state that goes quietly stale.

6. **Compose the commit message.**

   **House style** (conventional not in use) — unchanged:
   - Base: `Version {VersionValue}`.
   - If files **other than** the version file changed, append a brief single-line description of WHAT changed and WHY: `Version {VersionValue} — <what & why>`.

   **Conventional style** — `chore({TaskID}): version {VersionValue}`, or `chore: version {VersionValue}` with no Task ID. Never `chore(): …`. The type is always `chore`: the commit exists to record a version, whatever else rode along with it. When files beyond the version file changed, extend the description the same way — `chore(PROJ-123): version 1.6.0 — add retry backoff` — keeping the whole subject ≤ ~72 characters.

   **Co-authored-by.** Before composing, ask:

   `Add a Co-authored-by line for the agent? (y/N)`

   - **No** (the default) → no `Co-authored-by` line, even when the harness asks for one.
   - **Yes** → end the message with one trailer naming the agent family, not the model: take the
     attribution line the agent uses for commits and drop the model name and version —
     `Co-authored-by: Claude <noreply@anthropic.com>`, never `Claude <model> <version> <…>`.
     An attribution line that names no model (custom text, another agent's form) is used
     unchanged. The committing model is often not the one that wrote the change, so a model name
     would credit the wrong one. The trailer is the last paragraph, after any `BREAKING CHANGE:`
     footer, separated by a blank line. Pass each paragraph to `git commit` as its own `-m`.
   - If the agent has no attribution line of its own, skip the question and say so in the
     summary. Never invent a name or address.

   Ask every time, and record nothing, the same as the convention prompt.

7. **Breaking changes.** When `--breaking` is passed, mark it both ways the spec allows — `!` before the colon, and a footer:

       chore(PROJ-123)!: version 2.0.0

       BREAKING CHANGE: <what broke, and what callers must do instead>

   Ask for the footer text when the diff does not make it self-evident; that line is the part a reader acts on.

   In house style `--breaking` has nothing to attach to. Say it was ignored rather than dropping it silently.

8. **Determine the tag:**
   - Default: `dev-{VersionValue}`.
   - If on `RC-{n}` / `test-RC-{n}` **and** `{VersionValue}` does not already contain `rc{rcNumber}`: use `dev-rc{rcNumber}-{VersionValue}`.
   - Tag command: `git tag -a "<tag>" -m "v_<tag>"`.

9. **Dry-run gate.** If `--dry-run` was passed, print the version, the commit message, and the exact `git tag` command, then STOP.

10. **Approve the message.** Before committing, show exactly what is about to happen, then wait
    for an answer:

    ```
    Proposed commit message:

      <composed message, including any BREAKING CHANGE: footer and Co-authored-by trailer>

    Style:  <conventional | house> — <how it was decided>
    Staged: <n> file(s)
      <file list>
    Tag:    <the tag resolved in step 8>
    Push:   <yes, to <upstream> | no>

    Commit this? (yes / edit / no)
    ```

    Show the tag **as resolved in step 8** — `dev-rc2-1.6.0`, never the `dev-{VersionValue}`
    template. The RC form is the whole reason this line is worth printing: it is the value most
    likely to be wrong, and the hardest to undo once pushed.

    - **yes** → commit exactly the message shown. Do not recompose it.
    - **edit** → take the replacement the developer types and use it **verbatim** as the entire
      subject line. Do not re-apply the `TASK-ID:` prefix or the `type(scope):` wrapper — the text
      they typed already *is* the subject, and re-wrapping it produces
      `chore(PROJ-123): chore(PROJ-123): …`. If the edit does not match a convention the repo
      enforces, say so once and take it anyway; the gate exists to give the developer the last word.
    - **no** → commit nothing and create no tag. Leave the staged changes staged and stop, so
      re-running picks up where this left off.

    Ask every time. No flag skips this — `--dry-run` never reaches here, having stopped at step 9.

11. **Commit** with the approved message; confirm with `git log -1 --oneline`.

12. **Tag** using the command from step 8; confirm with `git tag -l "<tag>"`.

13. **Push (optional).** If `--push` was passed, run `git push` and `git push origin "<tag>"`; confirm.

14. **Summary.** Report the version, the style used (conventional or house), the commit message, the tag created, and whether it was pushed.
