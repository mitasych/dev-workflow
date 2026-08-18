---
name: workflow-release
description: "Workflow Step 7/8: SemVer bump, changelog commit, tag, and push"
argument-hint: "[major | minor | patch] [--dry-run]"
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git tag:*), Bash(git log:*), Bash(git push:*), Bash(git diff:*), Bash(cat:*), Bash(grep:*), Bash(ls:*)
model: sonnet
disable-model-invocation: true
---

# Release

You are performing the final step of the development workflow: **Commit & Tag**.
This follows a **single-commit + amend flow** to keep the release as one clean commit.

All commits should be without `Co-Authored-By` or `Made-with`

## Input

$ARGUMENTS

## Instructions

### 1. Determine version bump

**If a bump type is provided** (`major`, `minor`, `patch`):

- Use it directly.
  **If no bump type is provided:**

- Read `.workflow/current-issue.md` for context on what changed.

- Look at the CHANGELOG draft from the `/document` step if available.

- Inspect `git log` for recent commits.

- Determine the appropriate bump based on SemVer:
  
  - **major** — Breaking changes to public API or behavior
  - **minor** — New features, backward-compatible
  - **patch** — Bug fixes, minor improvements

- Present your reasoning and **ask for confirmation** before proceeding.

### 2. Find current version

- Check git tags: `git tag --sort=-v:refname | head -5`

- If no tags exist, start at `v0.1.0`

- Ask about tag's (version) postfix according to SemVer spec (e.g. `-alpha`, `-beta`, `-rc.1`, `-dev`, etc.)

- Calculate the next version based on the bump type

### 3. Build commit message

The commit message follows a structured format. Build it in this order:

#### Step 1 — Extract task ID (if available)

Read `.workflow/current-issue.md` and look at the **Source** field. If it contains a Jira ticket key or other task/issue identifier (e.g. `PROJ-123`, `#42`, `FEATURE-001`), extract it as `<TASK-ID>`. Prefer a `[A-Z]{2,}-\d+` key when more than one form is present: a bare `#42` is a legal conventional scope but an unusual one, and commitlint's scope rules may reject it, so use it only when it is the only identifier available.

If the Source field says "manual description" or contains no recognizable identifier, proceed without a task ID.

#### Step 2 — Generate a single-line summary

Analyze the actual code changes since the last tag (or since the start if no tags exist):

```bash
git diff --stat <last-tag>..HEAD
git log --oneline <last-tag>..HEAD
```

Write a concise, meaningful summary of **what changed** (not just "release"). Examples:

- `add retry logic for failed webhook deliveries`
- `fix race condition in consumer message ordering`
- `implement partner CRUD API endpoints`

Lowercase, imperative mood. Budget against the **assembled** subject rather than the summary alone — `chore(PROJ-123): release v1.2.0 — ` spends about 34 characters before the summary starts, so aim near 35 and treat 72 as the ceiling for the finished line.

#### Step 3 — Detect the commit style

Decide the format before assembling. Check in order:

- **A commitlint config** — `ls -a | grep -iE '^\.?commitlint'`, plus `grep -l '"commitlint"' package.json 2>/dev/null` (the redirect matters — most repos have no `package.json`, and the bare form writes an error and exits 2). Any hit settles it: **conventional**. A config is what the repo intends to enforce and wins over history, even where older commits predate it.
- **Recent history** — `git log -20 --format='%s'`. **Conventional** when most subjects match `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: `. Read "most" as 60% **of the subjects that came back**, not of 20 — a young repo returns fewer, and an absolute count would leave a repo whose every commit is conventional undetectable until its twelfth. Under 3 commits there is no signal either way: go straight to the prompt.
- **Neither** — ask: `No commit convention detected. Use Conventional Commits (type(scope): description)? (y/N)`

Ask every time. Do not record the answer — not in the scratchpad, not in a config, not in session memory. A repo that has not adopted the convention should keep being offered it, and re-asking is cheaper than state that goes quietly stale.

#### Step 4 — Assemble the commit message

**House style** (conventional not in use) — unchanged.

With task ID:

```
<TASK-ID>: release v<version> — <summary>
```

Without task ID:

```
release v<version> — <summary>
```

Examples:

- `PROJ-123: release v1.2.0 — add retry logic for failed webhook deliveries`
- `release v0.3.1 — fix race condition in consumer message ordering`

**Conventional style** — the type is `chore` and the scope is the task ID, matching
`/workflow-commit` and `/workflow-commit-dev`:

```
chore(<TASK-ID>): release v<version> — <summary>
chore: release v<version> — <summary>            (no task ID; never `chore():`)
```

Examples:

- `chore(PROJ-123): release v1.2.0 — add retry logic for webhooks`
- `chore: release v0.3.1 — fix race in consumer ordering`

Note that this deliberately does **not** use the `chore(release):` scope that
`standard-version` and `semantic-release` key on — the task ID owns the scope slot in every
skill in this plugin. Those tools will not recognise these as release commits; `/workflow-release`
is what cuts releases here.

**Breaking changes.** In conventional style, a **major** bump is a breaking change by
definition: apply `!` before the colon and add a footer.

```
chore(PROJ-123)!: release v2.0.0 — remove the legacy webhook path

BREAKING CHANGE: <what broke, and what callers must do instead>
```

Ask for the footer text — a major bump the user just confirmed in section 1 tells you a break
happened, not what it was. This skill deliberately has no `--breaking` flag: the bump already
carries the decision, and a flag able to contradict it would be a second source of truth. In house style there is no `!` and no footer; the version number
carries the signal alone.

**Assemble the final message now, before section 6 commits anything.** Section 6 amends with
`git commit --amend --no-edit`, which reuses the subject verbatim — a `!` or a footer decided
after the initial commit will never reach the message.
### 4. Dry run check

  If `--dry-run` is present:

- Show everything that **would** happen: the version, the assembled commit message from section 3, the changelog entry, and the tag.

- Compose the changelog entry as section 5 describes but **display it instead of writing it** — a dry run must leave `CHANGELOG.md` untouched.

- Stop after showing the preview.

### 5. Prepare CHANGELOG.md

- **REQUIRED — get the author first** (before writing any changelog text):
  
  ```bash
  git config user.name
  git config user.email
  ```
  
  Store these values. The author **must** appear inline on the version heading — never omit it.

- If a CHANGELOG draft exists in `.workflow/current-issue.md` → Use it (ensure the heading includes the inline author; rewrite if missing)

- If CHANGELOG.md has an `[Unreleased]` section → Move its contents under the new version heading and replace `[Unreleased]` with the version + date + author

- If no draft exists → Generate one from `git log` since the last tag
  Update CHANGELOG.md:
  
  ```markdown
  ## [<version>] - <YYYY-MM-DD> <git user.name> \<<git user.email>\>
  
  ### <Category>
  ```
  
  Example heading:
  
  ```
  ## [2.0.0] - 2026-05-14 Aleksandr Mitasov <oleksandr.mitasov@wiz-team.com>
  ```
  
  The inline author is **mandatory** — it must appear on the same line as the version and date in every release entry. Do **not** emit a separate `**Author**:` line below the heading.

- Follow the existing changelog format. If no format exists, use [Keep a Changelog](https://keepachangelog.com/).

### 6. Execute the single-commit + amend flow

#### Step 1 — Initial release commit

Commit all release-related files (changelog, docs, etc.) in a single commit:

```bash
git add CHANGELOG.md
git commit -m "<assembled commit message>"
```

If there are other documentation files updated by `/document` that haven't been committed yet, include them:

```bash
git add CHANGELOG.md README.md docs/
git commit -m "<assembled commit message>"
```

#### Step 2 — Review and amend

Show the commit and changelog to the user for review. If any edits are needed to CHANGELOG.md or other files:

```bash
# After edits are made:
git add CHANGELOG.md
git commit --amend --no-edit
```

Repeat amending until the user is satisfied.

#### Step 3 — Tag the final commit

```bash
git tag -a <version> -m "v_<version>"
```

### 7. Handle problems

- **Uncommitted changes exist** — Stop. List the uncommitted files and ask whether to include them in a pre-release commit or stash them.

- **Tag already exists** — Stop. Show the existing tag and ask how to proceed.

- **Push fails** — Report the error. Don't retry automatically.
  
  ### 8. Update scratchpad
  
  Append to `.workflow/current-issue.md`:
  
  ```markdown
  ## Release
  
  **Version**: <version>
  **Date**: <date>
  **Tag**: <version>
  **Pushed**: yes | no
  
  ### Commit
  ```

- `<sha short>` — <assembled commit message> (tagged <version>)
  
  ```
  Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.
  ```

### 9. Done

  Display a summary:

```
✅ Released v<version>
 Tag: v<version>
 Branch: <branch>
 Pushed: origin/<branch> + tags
```

  If this was the final step of the workflow, note that the issue is complete. The `.workflow/` scratchpad can be cleaned up or kept for reference.
