---
name: workflow-implement-green
description: "Workflow Step 4 (TDD): Write minimal code to make failing tests pass"
argument-hint: "[--cycle <number>] [--source <obsidian note | file | URL>]"
model: sonnet
disable-model-invocation: true
---

# Implement Green

You are performing Step 4 of the **TDD** development workflow: **Implement (Green)**.

The only goal is to make the failing tests pass. Nothing more.

## Input

$ARGUMENTS

## Instructions

### 1. Load context

- Read `.workflow/current-issue.md` — it must contain a **TDD plan** and a **Test Red Status** section.
- If no red tests are recorded, stop and suggest running `/test-red` first.
- Run the test suite to confirm which tests are currently failing.

**Additional sources (if `--source` is provided):**

- **Obsidian note path** → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** → Read the file contents
- **URL** → Fetch the page contents

### 2. Determine scope

- If `--cycle <number>` is provided → Implement only for that cycle's tests.
- Otherwise → Implement for **all cycles** in order.

### 3. Implement for each cycle

For each cycle:

#### a) Identify the failing tests

List the specific tests from the Test Red Status that need to pass.

#### b) Write the minimal implementation

This is the core discipline of the Green phase:

- Write **only** the code needed to make the failing tests pass
- Do NOT optimize, refactor, generalize, or beautify
- Do NOT add error handling beyond what the tests require
- Do NOT extract abstractions or create helper methods preemptively
- Hard-coded values are acceptable if they satisfy the tests
- It's OK if the code looks ugly — `/refactor` handles that next

#### c) Run the tests

- Run the specific tests for this cycle and confirm they **pass**
- Run the **full test suite** to confirm no existing tests broke
- If a new test passes but an old test breaks, fix the regression without violating the minimal-change principle

#### d) Mark complete

Note which cycle is green before moving to the next.

### 4. Handle problems

- **Can't make a test pass without large changes** — The test may be testing too much, or the plan's Green section underestimated the work. Report the issue and suggest revisiting the plan.
- **Existing test breaks** — Investigate. If it's a genuine conflict, report it. Don't silently change existing tests.
- **Test seems wrong** — If making the test pass requires clearly incorrect behavior, stop and flag the test for review rather than writing bad code to satisfy it.

### 5. Update scratchpad

After all cycles are green, update `.workflow/current-issue.md`:

```markdown
## Implement Green Status

**Completed**: <date>
**Cycles completed**: <X of Y>
**All tests passing**: yes | no

### Changes Made
- `<file path>` — <what was created/modified>
- `<file path>` — <what was created/modified>

### Test Results
- Total: <count>, Passing: <count>, Failing: <count>

### Issues
- <any problems encountered>
- (none if clean)
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

### 6. Next step

After all tests are green:

- Suggest running `/workflow-refactor` to clean up the implementation
- Remind: all tests must stay green throughout refactoring
