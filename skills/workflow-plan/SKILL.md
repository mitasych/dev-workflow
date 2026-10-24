---
name: workflow-plan
description: "Workflow Step 2: Plan implementation steps from a clarified issue"
argument-hint: "[issue description or --tdd] [--source <obsidian note | file | URL>]"
allowed-tools: Read, Grep, Glob, Bash(find:*), Bash(cat:*), Bash(git log:*), Bash(git diff:*), Bash(git branch:*), Bash(ls:*), Bash(tree:*), Write(.workflow/*)
model: opus
multi-turn: true
disable-model-invocation: true
---

# Plan

You are performing Step 2 of the development workflow: **Plan**.

> Before executing the instructions Activate Plan mode to ensure read-only execution. Exit Plan mode after reviewing the output to proceed with implementation.

## Input

$ARGUMENTS

## Constraints

**This is a read-only planning step.** You may explore the codebase freely (read files, search, list directories, check git history) but you must NOT:

- Create, modify, or delete any project files
- Run code, tests, or build commands
- Install dependencies
- Make git commits

The only file you may write to is `.workflow/current-issue.md` (the scratchpad).

## Instructions

### 1. Gather context

**Primary source — scratchpad:**

- Read `.workflow/current-issue.md` if it exists. This contains the output of the `/clarify` step.
- If the scratchpad doesn't exist or $ARGUMENTS contains an issue description, use that instead.

**Additional sources (if `--source` is provided):**

- **Obsidian note path** (e.g. `IT/Architecture/Payment Service`) → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** (e.g. `src/Service/PaymentService.php`, `src/services/payment.ts`) → Read the file contents
- **URL** (e.g. `https://docs.example.com/api`) → Fetch the page contents

**Project structure:**

- Scan the project directory tree to understand the codebase layout
- Identify existing patterns, conventions, and architectural style
- Look at relevant files that will be affected (from the clarification's "Affected Components")

### 2. Detect workflow mode

- If `--tdd` flag is present in arguments → **TDD mode**
- Otherwise → **Regular mode**

### 3. Create the plan

#### Regular mode

Break the solution into **concrete, ordered implementation steps**. Each step should be:

- Small enough to be a single logical change
- Independently verifiable where possible
- Listed with the specific files/classes/methods to create or modify

For each step, specify:

- **What** to do (clear action)
- **Where** (exact file paths, class names, method names)
- **Why** (how this step contributes to the solution)
- **Verify** (how to confirm this step is correct before moving on)

#### TDD mode

Structure the plan around the **Red-Green-Refactor** cycle:

For each feature/behavior unit:

1. **Red** — Which test(s) to write, what they assert, why they should fail
2. **Green** — Minimal implementation to make tests pass
3. **Refactor** — What cleanup or structural improvements to apply

Each cycle should map to a single testable behavior from the acceptance criteria.

### 4. Risk assessment

Identify:

- **High-risk areas** — Parts of the plan that could break existing functionality
- **Unknowns** — Things you're not sure about and need to investigate during implementation
- **Dependencies** — External services, migrations, config changes that must happen in order

### 5. Effort estimate

Provide a rough estimate:

- **Complexity**: Low / Medium / High
- **Estimated steps**: count of discrete implementation actions
- **Watch out for**: the single riskiest thing in this plan

## Output

Update `.workflow/current-issue.md` by appending the plan section:

### Regular mode template:

```markdown
## Implementation Plan

**Mode**: Regular
**Complexity**: <Low | Medium | High>
**Steps**: <count>

### Step 1: <title>
- **Action**: <what to do>
- **Files**: `<file path>` — <create | modify | delete>
- **Verify**: <how to check it worked>

### Step 2: <title>
- **Action**: <what to do>
- **Files**: `<file path>` — <create | modify | delete>
- **Verify**: <how to check it worked>

...

### Risks & Unknowns
- ⚠️ <risk 1>
- ❓ <unknown 1>

### Dependencies
- <dependency with order/timing>
- (none if no dependencies)
```

### TDD mode template:

```markdown
## Implementation Plan

**Mode**: TDD (Red-Green-Refactor)
**Complexity**: <Low | Medium | High>
**Cycles**: <count>

### Cycle 1: <behavior being tested>

**Red** (write failing tests):
- Test: `<test method name>` in `<test file>`
- Asserts: <what the test checks>
- Should fail because: <why it fails before implementation>

**Green** (make tests pass):
- **Files**: `<file path>` — <create | modify>
- **Minimal change**: <what to implement>

**Refactor**:
- <cleanup actions, if any>

### Cycle 2: <behavior being tested>
...

### Risks & Unknowns
- ⚠️ <risk 1>
- ❓ <unknown 1>

### Dependencies
- <dependency with order/timing>
- (none if no dependencies)
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

After saving, display the plan summary and ask for confirmation before proceeding. Suggest:

- `/workflow-implement` for regular mode
- `/workflow-test-red` for TDD mode
