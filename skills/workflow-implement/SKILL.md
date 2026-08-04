---
name: workflow-implement
description: "Workflow Step 3: Implement the planned solution (regular workflow)"
argument-hint: "[--step <number>] [--source <obsidian note | file | URL>]"
model: sonnet
disable-model-invocation: true
---

# Implement

You are performing Step 3 of the **regular** development workflow: **Implement**.

## Input

$ARGUMENTS

## Instructions

### 1. Load the plan

- Read `.workflow/current-issue.md` — it must contain an **Implementation Plan** section (output of `/plan`).
- If no plan is found, stop and suggest running `/plan` first.

**Additional sources (if `--source` is provided):**

- **Obsidian note path** → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** → Read the file contents
- **URL** → Fetch the page contents

### 2. Determine scope

- If `--step <number>` is provided → Execute only that specific step from the plan.
- Otherwise → Execute **all steps** in order.

### 3. Execute each step

For each step in the plan, follow this cycle:

#### a) Announce

Before starting a step, briefly state what you're about to do and which files will be touched.

#### b) Implement

Write the code. Follow these rules strictly:

- **Stick to the plan** — Do exactly what the step specifies. Do not add features, refactorings, or improvements not in the plan.
- **Minimal changes** — Touch only the files listed in the step. Avoid unrelated modifications.
- **Match project conventions** — Follow the existing code style, naming patterns, directory structure, and framework idioms found in the project.
- **No dead code** — Don't leave commented-out code, TODOs, or placeholder logic unless the plan explicitly calls for it.
- **Inline documentation** — Insert comments solely when the implementation is not self-explanatory from the source code. Comments must be maximally concise while preserving complete semantic integrity.

#### c) Verify

After completing a step, run the verification described in the plan (e.g., run tests, check compilation, confirm behavior). Report the result.

#### d) Mark complete

Note which step was completed before moving to the next.

### 4. Handle problems

If during implementation you discover:

- **The plan is wrong or incomplete** — Stop. Explain what's wrong and suggest re-running `/plan` with the new information.
- **A step is blocked by a dependency** — Skip it, mark it as blocked, continue with remaining steps.
- **An unexpected side effect** — Report it immediately. Don't silently fix it unless it's trivially safe.

### 5. Update scratchpad

After all steps are done (or if stopped early), update `.workflow/current-issue.md`:

```markdown
## Implementation Status

**Completed**: <date>
**Steps completed**: <X of Y>
**Blocked steps**: <list or "none">

### Changes Made
- `<file path>` — <what was done>
- `<file path>` — <what was done>

### Issues Encountered
- <issue description, if any>
- (none if clean)
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

### 6. Next step

After implementation:

- If all steps completed cleanly → Suggest running `/workflow-review`
- If steps are blocked or issues encountered → Summarize what needs attention before continuing
