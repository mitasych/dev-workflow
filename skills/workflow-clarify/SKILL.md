---
name: workflow-clarify
description: "Workflow Step 1: Clarify & scope an issue before planning or implementation"
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

### 1. Parse the input

The input may contain:

- **Issue**: a text description, or a Jira ticket key (e.g. `PROJ-123`)
- **Optional `--source`**: one or more additional context sources, separated by commas or repeated flags

### 2. Gather source material

**Issue source:**

- **Jira ticket key** → Fetch the ticket details using available Jira/Atlassian MCP tools (title, description, comments, linked issues)
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
**Additional context**: <list of --source references, or "none">
**Date**: <current date>
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

After saving, display a summary and highlight any **open questions** that need to be resolved before moving to the planning step (`/workflow-plan`).

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

If there are no open questions and everything is clear, suggest proceeding to `/workflow-plan`.
