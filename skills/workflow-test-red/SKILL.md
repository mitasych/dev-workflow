---
name: workflow-test-red
description: "Workflow Step 3 (TDD): Write failing tests from acceptance criteria"
argument-hint: "[--cycle <number>] [--source <obsidian note | file | URL>]"
model: sonnet
disable-model-invocation: true
---

# Test Red

You are performing Step 3 of the **TDD** development workflow: **Write Failing Tests (Red)**.

## Input

$ARGUMENTS

## Instructions

### 1. Load the plan

- Read `.workflow/current-issue.md` — it must contain an **Implementation Plan** with **Mode: TDD** and Red-Green-Refactor cycles.
- If no TDD plan is found, stop and suggest running `/plan --tdd` first.

**Additional sources (if `--source` is provided):**

- **Obsidian note path** → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** → Read the file contents
- **URL** → Fetch the page contents

### 2. Determine scope

- If `--cycle <number>` is provided → Write tests only for that specific cycle.
- Otherwise → Write tests for **all cycles** in order.

### 3. Prepare

Before writing any tests:

- Examine the project's existing test structure (directories, naming conventions, base classes, test framework)
- Identify the test framework in use (e.g. PHPUnit, Pest, Jest/Vitest, Go testing, pytest)
- Follow the project's existing patterns for test file location, naming, and organization

### 4. Write failing tests for each cycle

For each cycle in the plan:

#### a) Announce

State which behavior/cycle you're writing tests for and what the tests will assert.

#### b) Write the test(s)

- Translate the cycle's **Red** section into real test code
- Each test should be **focused on one behavior** from the acceptance criteria
- Use descriptive test method names that read as specifications (e.g., `testUploadRejectsFilesLargerThan10Mb`, `TestRateLimiterBlocksAfterThreshold`)
- Include both the happy path and the edge cases specified in the plan
- Set up only the minimal fixtures/mocks needed

#### c) Verify the test fails

- Run the test and confirm it **fails for the right reason**
- The failure should be because the feature doesn't exist yet, not because of a broken test setup, missing import, or syntax error
- If the test fails for the wrong reason, fix the test until it fails correctly

#### d) Mark complete

Note which cycle's tests are done before moving to the next.

### 5. Handle problems

- **Test passes unexpectedly** — The behavior already exists. Report this — it may mean the plan needs updating or the acceptance criteria overlap with existing functionality.
- **Can't write a meaningful test** — The acceptance criteria may be too vague. Stop and list what needs clarification before continuing.
- **Missing test infrastructure** (fixtures, factories, test database) — Note what's needed and create it if straightforward, or flag it as a blocker.

### 6. Update scratchpad

After all tests are written, update `.workflow/current-issue.md`:

```markdown
## Test Red Status

**Completed**: <date>
**Cycles covered**: <X of Y>

### Tests Written
- `<test file>` — `<test method>` — asserts: <what it checks> — ✅ fails correctly
- `<test file>` — `<test method>` — asserts: <what it checks> — ✅ fails correctly
- ...

### Issues
- <any problems encountered>
- (none if clean)
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

### 7. Next step

After all tests are red:

- Suggest running `/workflow-implement-green` to make them pass
- List the test commands to run for quick verification (e.g., `php bin/phpunit --filter=TestClassName`, `php artisan test --filter=TestClassName`, `npm test`, `go test ./...`)
