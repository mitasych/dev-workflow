---
name: workflow-document
description: "Workflow Step 6/7: Update documentation impacted by the changes"
argument-hint: "[--source <obsidian note | file | URL>]"
model: sonnet
disable-model-invocation: true
---

# Document

You are performing the **Document** step of the development workflow.

## Input

$ARGUMENTS

## Instructions

### 1. Load context

- Read `.workflow/current-issue.md` for the full issue context, plan, and implementation details.
- Run `git diff main...HEAD` to see all changes.
- Scan the project for existing documentation files (README, CHANGELOG, docs/, API specs, ADRs).

**Additional sources (if `--source` is provided):**

- **Obsidian note path** → Use the `obsidian-cli` skill (invoke the `obsidian` CLI via bash per `~/.claude/skills/obsidian-cli/SKILL.md`). Only if the skill is unavailable in this session, fall back to the `obsidian-cli-mcp` MCP tools.
- **Project file path** → Read the file contents
- **URL** → Fetch the page contents

### 2. Determine what needs documentation

Check each category and assess whether the changes impact it:

#### a) CHANGELOG.md

- **REQUIRED — get the author first** (before writing any changelog text):
  ```bash
  git config user.name
  git config user.email
  ```
  Store these values. The author **must** appear inline on the section heading — never omit it.
- Draft an entry for this change under an `[Unreleased]` section
- Format the heading so the author follows the version + date inline:
  ```
  ## [Unreleased] - <YYYY-MM-DD> <git user.name> \<<git user.email>\>
  ```
  Example:
  ```
  ## [2.0.0] - 2026-05-14 Aleksandr Mitasov <oleksandr.mitasov@wiz-team.com>
  ```
- Follow the existing changelog format (Keep a Changelog, custom, etc.)
- Classify: Added / Changed / Fixed / Deprecated / Removed / Security
- Write from the user/consumer perspective, not the developer perspective

#### b) README.md

- New features that need usage instructions?
- Changed configuration or environment variables?
- Updated installation or setup steps?
- New dependencies?

#### c) API documentation

- New endpoints or changed request/response formats?
- Updated OpenAPI/Swagger specs?
- Changed authentication or authorization requirements?

#### d) Inline code documentation

- Insert inline documentation solely when the implementation is not self-explanatory from the source code. Comments must be maximally concise while preserving complete semantic integrity.
- Public API methods that need docblocks?
- Non-obvious design decisions worth a brief comment?
- Do NOT over-comment, and remove existing comments that merely restate the code

#### e) Architecture Decision Records (ADRs)

- Was a significant architectural choice made during this issue?
- If yes, draft an ADR following the project's format (or propose a simple one: Title, Context, Decision, Consequences)

#### f) Configuration / Environment

- New environment variables or config keys?
- Document in the appropriate place (.env.example, README, config docs)

### 3. Apply updates

For each documentation item:

- Match the existing style and format exactly
- Be concise — documentation that nobody reads is worse than none
- Use concrete examples where they help (sample requests, config snippets)

### 4. Skip what's not needed

Not every change needs documentation updates. If a category isn't impacted, skip it. Don't add documentation for the sake of having documentation.

### 5. Update scratchpad

Append to `.workflow/current-issue.md`:

```markdown
## Documentation Status

**Completed**: <date>

### Updated
- `<file>` — <what was updated>
- `<file>` — <what was updated>

### Skipped (not impacted)
- <category> — <reason>

### CHANGELOG draft
<the changelog entry text, ready for /release>
```

Create a `.gitignore` file within the `.workflow` directory containing a single line `*`, if such a file does not already exist.

### 6. Next step

- Suggest running `/workflow-release` to finalize the version, commit the changelog, and tag
