---
name: workflow-test
description: "Workflow Step 5 (Regular): Write or update tests, run the test suite"
argument-hint: "[--source <obsidian note | file | URL>]"
model: sonnet
disable-model-invocation: true
---

# Test

You are performing Step 5 of the **regular** development workflow: **Test**.

## Input

$ARGUMENTS

## Instructions

### 1. Load context

- Read `.workflow/current-issue.md` for the issue description, acceptance criteria, and implementation status.
- Run `git diff main...HEAD` (or `git diff --staged`, or `git diff`) to identify what changed.
- Examine the project's existing test structure, framework, and conventions.

**Additional sources (if `--source` is provided):**

- **Obsidian note path** → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** → Read the file contents
- **URL** → Fetch the page contents

### 2. Analyze test coverage needs

Based on the changes and acceptance criteria, determine:

- **New tests needed** — What new behavior was introduced that has no tests?
- **Existing tests to update** — Which existing tests are affected by the changes?
- **Edge cases** — What edge cases from the clarification need test coverage?
- **Regression tests** — Are there scenarios where the change could break existing behavior?

### 3. Write tests

For each test:

#### a) Follow project conventions

- Match the existing test directory structure and naming patterns
- Use the same test framework, assertion style, and helper utilities
- Follow the project's approach to fixtures, factories, mocks

#### b) Write meaningful tests

- Each test should verify **one specific behavior**
- Test names should read as specifications
- Test the **behavior**, not the implementation details
- Include both positive cases (it works) and negative cases (it fails gracefully)
- Cover the edge cases identified in the clarification
- Insert comments solely when the test's intent is not self-explanatory from the source code. Comments must be maximally concise while preserving complete semantic integrity.

#### c) Avoid common test pitfalls

- No tests that only assert `!= null` or `assertTrue(true)`
- No shared mutable state between tests
- No tests that depend on execution order
- No brittle assertions on exact error messages unless the message matters
- No tests that hit external services without mocking

### 4. Run the test suite

After writing tests:

1. **Run new tests** — Confirm they pass
2. **Run the full suite** — Confirm nothing else broke
3. **Report results** — Total count, passing, failing, skipped

If any test fails:

- Determine if it's a test bug or a code bug
- Fix test bugs directly
- Report code bugs — don't silently fix implementation code in this step

### 5. Run quality tools

Detect which quality/static-analysis tools are configured in the project and run them against the changed files (or the full project if the tool doesn't support file targeting).

#### a) Detection

Look for configuration signals — config files, package.json scripts/devDependencies, Makefile/Taskfile targets, composer.json scripts, pyproject.toml sections, Cargo.toml, `.golangci.yml`, etc. Common tools to look for:

| Category | Examples |
|---|---|
| **Linters** | eslint, pylint, flake8, ruff, golangci-lint, phpstan, phpcs, rubocop, clippy, biome |
| **Formatters** | prettier, black, gofmt/goimports, php-cs-fixer, rustfmt, biome |
| **Type checkers** | tsc --noEmit, mypy, pyright, phpstan (level), psalm |
| **Static analysis** | semgrep, sonarqube, psalm, bandit, gosec, shellcheck |

Only run tools that are **actually configured** in the repo — never install or configure new ones.

#### b) Execution

- Prefer project-local runners (`npx`, `composer exec`, `poetry run`, `cargo`, `go run`, etc.)
- Prefer checking only changed files when the tool supports it (e.g., `eslint <files>`, `ruff check <files>`)
- Fall back to full-project check if file targeting isn't supported
- Run formatter checks in **verify/check mode** (e.g., `prettier --check`, `black --check`) — do not auto-fix

#### c) Reporting

If any tool reports issues:

- **Auto-fixable style issues** (formatting, import order) → Fix them directly
- **Lint warnings/errors in changed code** → Fix them directly
- **Pre-existing lint issues in untouched code** → Report but do not fix (out of scope)
- **Type errors** → Determine if caused by the current changes and fix if so

### 6. Coverage assessment

Provide a brief assessment:

- Which acceptance criteria are covered by tests?
- Which acceptance criteria are NOT covered and why?
- Are there any meaningful gaps?

Don't chase coverage metrics — focus on whether the **important behaviors** are tested.

### 7. Update scratchpad

Append to `.workflow/current-issue.md`:

```markdown
## Test Status

**Completed**: <date>
**All tests passing**: yes | no

### Tests Written
- `<test file>` — `<test method>` — covers: <what behavior>
- `<test file>` — `<test method>` — covers: <what behavior>

### Tests Updated
- `<test file>` — `<test method>` — <what changed>

### Test Results
- Total: <count>, Passing: <count>, Failing: <count>, Skipped: <count>

### Quality Tools
- Tools detected: <list of tools found>
- Tools run: <list of tools executed>
- Issues found: <count> | Issues fixed: <count> | Pre-existing (skipped): <count>

### Coverage Assessment
- Covered: <list of acceptance criteria with test coverage>
- Not covered: <gaps and reasons>
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

### 8. Next step

- If all tests pass → Suggest running `/workflow-document`
- If tests fail due to code bugs → Suggest fixing implementation first, then re-running `/workflow-test`
