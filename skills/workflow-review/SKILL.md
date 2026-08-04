---
name: workflow-review
description: "Workflow Step 4/6: Code review against project standards and best practices"
argument-hint: "[--source <obsidian note | file | URL>]"
model: opus
disable-model-invocation: true
---

# Code Review

You are performing the **Code Review** step of the development workflow.

Adopt a **critical reviewer mindset** — actively look for problems rather than assuming the code is correct. Your job is to catch what the implementer missed.

## Input

$ARGUMENTS

## Instructions

### 1. Load context

- Read `.workflow/current-issue.md` for the issue description, plan, and implementation status.
- Run `git diff main...HEAD` (or `git diff --staged` if not on a branch) to get the actual changes under review.
- If no changes are detected, run `git diff` for unstaged changes.

**Additional sources (if `--source` is provided):**

- **Obsidian note path** → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** → Read the file contents
- **URL** → Fetch the page contents

### 2. Review dimensions

Evaluate the changes across these dimensions, in priority order:

#### a) Correctness

- Does the code actually solve the problem stated in the issue?
- Are all acceptance criteria met?
- Are there logic errors, off-by-one mistakes, race conditions?
- Are edge cases from the clarification handled?

#### b) Security

- SQL injection, XSS, CSRF vulnerabilities
- Improper input validation or sanitization
- Secrets or credentials exposed
- Insecure deserialization, path traversal
- Missing authorization checks

#### c) Performance

- N+1 queries, missing indexes
- Unnecessary loops, redundant computations
- Memory leaks, unbounded collections
- Missing caching where appropriate
- Blocking operations in async contexts

#### d) Architecture & Design

- Does it follow the project's established patterns?
- Proper separation of concerns (controller/service/repository layers)
- Dependency injection used correctly
- No circular dependencies introduced
- Appropriate use of framework features (e.g. Symfony/Laravel services, Node.js/TypeScript modules, Go interfaces)

#### e) Language & Framework Conventions

Apply the idioms of the project's actual language and framework. Common stacks (examples, not an exhaustive list):

- PHP (vanilla): PSR-12, `declare(strict_types=1)`, modern PHP idioms
- PHP/Symfony: PSR standards, type hints, Symfony service/DI best practices
- PHP/Laravel or Lumen: Eloquent conventions, service providers, framework helpers used idiomatically
- Node.js / TypeScript: async/await over callbacks, strict `tsconfig` types, ESLint/Prettier conventions
- Go: effective Go patterns, error handling, interface usage
- Python: PEP 8, type annotations, pythonic idioms
- Proper use of framework-specific features and patterns

#### f) Maintainability

- Clear naming (variables, methods, classes)
- Inline documentation present solely where the implementation is not self-explanatory, maximally concise, and semantically complete
- Reasonable method/function length
- No unnecessary complexity

#### g) Tests (if present in the diff)

- Do tests actually test what they claim?
- Are assertions meaningful (not just `assertNotNull`)?
- Test isolation — no shared mutable state between tests
- Edge cases covered?

### 3. Severity classification

Classify each finding:

- 🔴 **Critical** — Must fix. Bugs, security issues, data loss risks.
- 🟡 **Warning** — Should fix. Performance problems, missing validation, architectural violations.
- 🔵 **Suggestion** — Consider fixing. Style issues, minor improvements, alternative approaches.

### 4. Output format

Present the review as:

```
## Code Review Results

**Reviewed**: <date>
**Changes**: <file count> files, +<additions> -<deletions>
**Verdict**: ✅ Approve | ⚠️ Approve with comments | ❌ Request changes

### 🔴 Critical (<count>)

**[C1]** `<file>:<line>` — <title>
<explanation of the problem and why it matters>
**Suggested fix:**
<code or description of the fix>

### 🟡 Warnings (<count>)

**[W1]** `<file>:<line>` — <title>
<explanation>

### 🔵 Suggestions (<count>)

**[S1]** `<file>:<line>` — <title>
<explanation>

### Summary
<1-2 sentence overall assessment>
```

### 5. Update scratchpad

Append to `.workflow/current-issue.md`:

```markdown
## Code Review

**Date**: <date>
**Verdict**: <verdict>
**Criticals**: <count>
**Warnings**: <count>
**Suggestions**: <count>

### Findings requiring action
- [C1] <title> — <file>
- [W1] <title> — <file>
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

### 6. Next step

Based on the verdict:

- **✅ Approve** → Suggest `/workflow-test` (regular) or `/workflow-document` (if tests already done in TDD)
- **⚠️ Approve with comments** → List what should ideally be fixed, suggest proceeding with caution
- **❌ Request changes** → List the critical items that must be fixed before continuing. Do NOT suggest moving forward.
