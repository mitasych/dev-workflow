---
name: workflow-clarify
description: "Workflow Step 1: Clarify & scope an issue before planning or implementation, then optionally cut a working branch from an up-to-date base"
argument-hint: "<issue description or Jira ticket key> [--source <obsidian note path | file path | URL>]"
model: sonnet
disable-model-invocation: true
---

# Clarify & Scope

You are performing Step 1 of the development workflow: **Clarify & Scope**.

## Input

The issue to clarify:

$ARGUMENTS

## Instructions

### 1. Handle an existing scratchpad

Before anything else, check whether `.workflow/current-issue.md` already exists.

If it does, read its `**Source**` and `# Issue:` lines and ask the user:

`.workflow/current-issue.md already holds <SOURCE> — "<title>". Archive it as .workflow/<KEY>-issue.md before starting? (yes / no, overwrite)`

- **Archive** → `git mv`/`mv` it to `.workflow/<KEY>-issue.md`, where `<KEY>` is the ticket
  key from `**Source**`. If `**Source**` is a manual description (no `[A-Z]{2,}-\d+` key),
  use a short kebab-case slug of the issue title instead. If that target already exists,
  append `-2`, `-3`, … rather than clobbering it.
- **Overwrite** → proceed; the old content is lost.

Never archive or overwrite without an answer. If the file does not exist, skip this step
silently.

### 2. Parse the input

The input may contain:

- **Issue**: a text description, or a Jira ticket key (e.g. `PROJ-123`)
- **Optional `--source`**: one or more additional context sources, separated by commas or repeated flags

### 3. Gather source material

**Issue source:**

- **Jira ticket key** → Fetch the ticket details using available Jira/Atlassian MCP tools (title, description, comments, linked issues)
  - If the fetch **succeeds**, note that the issue is Jira-sourced — it sets `**Source type**: jira` in the output.
  - If no Jira/Atlassian MCP tool is available, the fetch fails, or it returns no ticket, say so explicitly, treat the key as a plain label, and continue with `**Source type**: manual`. Never mark it `jira` on the strength of the key's *format* alone.
- **Text description** → Use it directly as the issue statement

**Additional sources (if `--source` is provided):**

- **Obsidian note path** (e.g. `IT/Architecture/Payment Service`) → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** (e.g. `src/Service/PaymentService.php`, `src/services/payment.ts`) → Read the file contents
- **URL** (e.g. `https://docs.example.com/api`) → Fetch the page contents

Incorporate the additional source material as context when performing the analysis. Reference it where relevant in the output.

## Analysis Steps

1. **Restate the problem** — What exactly needs to happen? Rephrase the issue in your own words to confirm understanding.

2. **Expected behavior** — Describe the desired end state. What should the user/system see or experience after this is done?

3. **Acceptance criteria** — List concrete, testable conditions that define "done". Use the format: `[ ] Given ... When ... Then ...` or simple checkboxes.

4. **Affected components** — Identify which files, modules, services, or layers are likely impacted. Scan the project structure to ground this in reality.

5. **Edge cases & error scenarios** — What could go wrong? What unusual inputs or states should be handled?

6. **Dependencies & blockers** — Are there external services, other tickets, migrations, or config changes needed first?

7. **Open questions** — List anything that's ambiguous or needs clarification from the team/PM before proceeding. Be specific about what you need to know and why. 
   
8. **Ask questions from** the `Open questions` list, one question at a time.

## Output

Save the analysis to `.workflow/current-issue.md` in the following format:

```markdown
# Issue: <short title>

**Source**: <Jira ticket key or "manual description">
**Source type**: <"jira" only if ticket content was actually retrieved from Jira; otherwise "manual">
**Additional context**: <list of --source references, or "none">
**Date**: <current date>
**Branch**: <branch created for this task, or the branch already checked out>
**Base branch**: <branch it was cut from, or "n/a">
**Status**: Clarified — awaiting planning

## Problem Statement
<restated problem>

## Expected Behavior
<desired end state>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>
- ...

## Affected Components
- <component/file/service 1> — <why it's affected>
- <component/file/service 2> — <why it's affected>

## Edge Cases & Error Scenarios
- <scenario 1>
- <scenario 2>

## Dependencies & Blockers
- <dependency 1>
- (none if no dependencies)

## Open Questions
- <question 1> — <why this matters>
- (none if everything is clear)
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

Fill `**Branch**` with the branch currently checked out — the branching step below updates it if a new branch gets created.

## Create a working branch

The scratchpad is saved, but the developer still has to decide where this work will live.
This is the right moment to settle it: the key and title are fresh, and it is the last point
before implementation where cutting from a stale base is still free to fix. Once there are
commits on a branch that started from a week-old `develop`, the conflicts are already baked in.

Skip this whole section, with a one-line note, if the project is not a git repository.

### 1. Ask first — one question, nothing else

This is the only question in this section asked every time, and it is strictly binary. Ask it on
its own, before any name or base has been considered:

`Do you want to create a new branch for this task? (yes / no)`

**No** → skip the entire rest of this section. No fetch, no switch, no stash, no follow-up
questions. Record the branch currently checked out as `**Branch**` and go to the wrap-up.

**Yes** → work through 2–4 below.

Keep this gate separate from everything that follows. The failure worth avoiding is folding it
into the base-branch choice and presenting something like "stay on current / create feature/x" —
that merges two unrelated decisions and hides most of the real options. Whether to branch is one
question; what to branch *from* is a different one, asked only after the answer is yes.

Ask regardless of where the issue came from: a `manual` source type means there is no ticket key
yet, not that the work deserves no branch of its own.

One case deserves a recommendation rather than a neutral ask — when HEAD is already on a branch
carrying this issue's key (someone ran `git switch -c DW-1_...` before clarifying). Point that
out and suggest staying, but still let them answer.

### 2. Choose the base branch

Present the real candidates as an explicit list, not a fallback chain. Every one of these that
exists belongs in it:

1. **`develop`** — whenever it exists locally or as `origin/develop`. Always list it; on
   gitflow-style repos it is nearly always the right answer.
2. **The current branch** — always list it, whatever it is. Stacking a task branch on work in
   progress is common and legitimate.
3. **The remote default** — `main`/`master`, when not already covered above:
   ```bash
   git symbolic-ref --short refs/remotes/origin/HEAD
   ```
4. **Something else** — let them type a branch name.

Listing the current branch here means "cut the new branch from it". It is not an offer to stay on
it — that was already settled in step 1.

Recommend one, but let the developer pick. A branch cut from the wrong base looks completely
normal until merge time, which is the most expensive moment to discover it.

### 3. Propose a name

Read the convention off the repo first:

```bash
git branch -a --format='%(refname:short)'
```

Two signals decide the prefix, in this order:

- **What the repo already uses.** If `feature/` and `chore/` appear in that output and nothing
  else does, those are the house style — put them first.
- **What kind of task this is**, from the problem statement you just wrote: `feature/` for new
  capability, `bugfix/` or `fix/` for defects, `hotfix/` for something urgent against production,
  `chore/` for maintenance and tooling, `release/` for release prep.

Recommend the prefix where both signals agree, list the others (including any of the six the repo
has not used yet — a repo that has never needed a `hotfix/` still allows one), and always include
an unprefixed option. Take any name the developer types verbatim.

The body of the name is the issue key, an underscore, then the title slugified — lowercase,
runs of non-alphanumerics collapsed to single hyphens:

    feature/DW-1_workflow-clarify-and-new-branch-creating
    DW-1_workflow-clarify-and-new-branch-creating          (unprefixed)

The key leads for a concrete reason: `/workflow-commit` recovers the Task ID by matching
`[A-Z]{2,}-\d+` against the branch name and prefixes every commit message with it. A `feature/`
prefix is harmless to that match; losing the key is not — every commit on the branch silently
ships without its Task ID.

When the issue arrived without a key, ask for one here rather than assuming there isn't one —
developers often know the ticket number even when the description they pasted never mentioned
it. If they supply one, treat it as the key. If they don't, propose the branch built from the
bare slug and mention once that commits on it will carry no Task ID prefix. An untracked issue
is still worth branching for; it just loses that one piece of automation.

### 4. Refresh the base before cutting

This is the part the issue is actually about — the branch has to start from what the remote has
now, not from whatever was fetched days ago:

```bash
git fetch origin
git fetch origin <base>:<base>    # fast-forwards the local ref without checking it out
```

Updating the ref instead of switching to it means a dirty working tree never blocks the refresh,
and there is no branch-switching round trip. When the base is the branch already checked out, git
refuses that refspec form — use `git pull --ff-only` there.

Both forms refuse to create a merge commit. If either fails, the local base has diverged from the
remote: report what happened and ask whether to cut from the stale base anyway or stop and sort
the divergence out first. The same applies when there is no remote, the host is unreachable, or
the fetch fails for any other reason — say why, then ask. Quietly branching from an unverified
base is the exact failure this step exists to prevent.

### 5. Handle uncommitted changes

If the working tree is dirty, show what is in it:

```bash
git status --short
```

Then ask how to proceed: stash → branch → pop, commit first (stopping here), or skip branch
creation. Do not stash on the developer's behalf — a `git stash pop` that conflicts drops them
into a conflicted tree they never asked for, in the middle of a step they thought was about
scoping a ticket.

### 6. Create it and record it

```bash
git switch -c <name> <base>
```

If the name already exists locally or on the remote, report the collision and ask — different
name, switch to the existing branch, or stop. Never force-move a branch someone else may be using.

Then update the `**Branch**` and `**Base branch**` fields in `.workflow/current-issue.md` so
`/workflow-plan` and `/workflow-commit` inherit the context instead of re-deriving it.

## Wrap up

Display a summary: the restated problem, the acceptance criteria, and — when a branch was
created — its name and the base it was cut from. Highlight any **open questions** that need
resolving before moving to the planning step.

If there are no open questions and everything is clear, suggest proceeding to `/workflow-plan`.
