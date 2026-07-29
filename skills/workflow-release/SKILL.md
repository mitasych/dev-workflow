---
name: workflow-release
description: "Workflow Step 7/8: SemVer bump, changelog commit, tag, and push"
argument-hint: "[major | minor | patch] [--dry-run]"
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git tag:*), Bash(git log:*), Bash(git push:*), Bash(git diff:*), Bash(cat:*), Bash(grep:*)
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

### 3. Dry run check

  If `--dry-run` is present:

- Show everything that **would** happen (version, changelog entry, commits, tag) without executing anything.

- Stop after showing the preview.

### 4. Prepare CHANGELOG.md

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

### 5. Build commit message

The commit message follows a structured format. Build it in this order:

#### Step 1 — Extract task ID (if available)

Read `.workflow/current-issue.md` and look at the **Source** field. If it contains a Jira ticket key or other task/issue identifier (e.g. `PROJ-123`, `#42`, `FEATURE-001`), extract it as `<TASK-ID>`.

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

Keep it under 72 characters, lowercase, imperative mood.

#### Step 3 — Assemble the commit message

**With task ID:**

```
<TASK-ID>: release v<version> — <summary>
```

**Without task ID:**

```
release v<version> — <summary>
```

Examples:

- `PROJ-123: release v1.2.0 — add retry logic for failed webhook deliveries`
- `release v0.3.1 — fix race condition in consumer message ordering`

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
