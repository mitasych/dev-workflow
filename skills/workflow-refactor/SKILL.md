---
name: workflow-refactor
description: "Workflow Step 5 (TDD): Refactor implementation while keeping tests green"
argument-hint: "[--source <obsidian note | file | URL>]"
model: opus
disable-model-invocation: true
---

# Refactor

You are performing Step 5 of the **TDD** development workflow: **Refactor**.

The code works. The tests are green. Now make it clean — without breaking anything.

## Input

$ARGUMENTS

## Instructions

### 1. Load context

- Read `.workflow/current-issue.md` — it must contain an **Implement Green Status** confirming all tests pass.
- If tests are not all green, stop and suggest running `/implement-green` first.
- Run the full test suite to confirm the starting state is green.

**Additional sources (if `--source` is provided):**

- **Obsidian note path** → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** → Read the file contents
- **URL** → Fetch the page contents

### 2. Analyze what needs refactoring

Review the changes made during `/implement-green` and identify:

- **Duplication** — Repeated code that should be extracted
- **Naming** — Variables, methods, classes with unclear or misleading names
- **Structure** — Long methods, god classes, misplaced responsibilities
- **Patterns** — Violations of project architectural patterns (e.g., service layer, repository pattern, dependency injection)
- **Language idioms** — Non-idiomatic code for the project's language/framework (e.g. PHP, PHP/Symfony, PHP/Laravel or Lumen, Node.js/TypeScript, Go, or Python conventions)
- **Hard-coded values** — Values introduced during Green phase that should become constants, config, or parameters
- **Missing error handling** — Cases that tests don't cover but production code should handle

Present the list and prioritize: what gives the most improvement for the least risk.

### 3. Refactor in small steps

For each refactoring action:

#### a) Announce

State what you're changing and why. Name the refactoring technique if applicable (Extract Method, Rename, Move, Inline, etc.).

#### b) Apply the change

- One refactoring at a time
- Each change should be a single, reversible transformation
- Do NOT change behavior — if you're tempted to, that's a new cycle, not a refactoring

#### c) Run tests

- Run the full test suite after **every** change
- If any test fails → **immediately revert** the change and investigate
- Never proceed to the next refactoring with a failing test

#### d) Confirm

Note the refactoring as complete before moving to the next.

### 4. Refactoring boundaries

**Do:**

- Improve readability and structure of the code changed in this issue
- Align with existing project conventions and patterns
- Extract meaningful abstractions that emerged from the implementation
- Improve type hints, return types, and docblocks where they add clarity
- Keep inline documentation solely where the implementation is not self-explanatory from the source code; comments must be maximally concise while preserving complete semantic integrity — delete comments that a rename or extraction has made redundant

**Don't:**

- Refactor unrelated code (even if you notice issues — note them separately)
- Change public APIs or interfaces unless the plan explicitly calls for it
- Add new features or behaviors
- Refactor tests themselves (unless they have obvious duplication from the Red phase)

### 5. Update scratchpad

After refactoring is complete, update `.workflow/current-issue.md`:

```markdown
## Refactor Status

**Completed**: <date>
**All tests still passing**: yes

### Refactorings Applied
- <technique>: <what was changed> — <why>
- <technique>: <what was changed> — <why>

### Code Quality Notes
- <observations about remaining technical debt, if any>
- (none if clean)
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

### 6. Next step

After refactoring:

- Suggest running `/workflow-review` for a final quality check
- Note: the code should now be clean, tested, and ready for review
