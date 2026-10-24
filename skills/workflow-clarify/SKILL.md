---
name: workflow-clarify
description: "Workflow Step 1: Clarify & scope an issue before planning or implementation"
argument-hint: "<issue description or Jira ticket key> [--source <obsidian note path | file path | URL>]"
model: sonnet
multi-turn: true
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
  - Record the ticket's `parent` when it has one, with the parent's issue type. `/workflow-branch` names the branch after a **story** parent and ignores an **epic** one, so the type is the load-bearing half.
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
**Parent**: <parent key — title (issue type), when this is a subtask; otherwise "none">
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

Fill `**Branch**` with the branch currently checked out and `**Base branch**` with `n/a`;
`/workflow-branch` overwrites both if you cut a new branch.

## Wrap up

Display a summary: the restated problem and the acceptance criteria. Highlight any **open
questions** that need resolving before moving to the planning step.

Then suggest `/workflow-branch` — unless this is not a git repository, or HEAD is already on a
branch carrying this issue's key. Give the reason rather than just naming the command: the key
and title are fresh right now, and this is the last point before implementation where cutting
from a stale base is still free to fix. Once there are commits on a branch that started from a
week-old `develop`, the conflicts are already baked in.

If there are no open questions and everything is clear, suggest `/workflow-plan` after that.
