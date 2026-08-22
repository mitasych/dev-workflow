---
name: workflow-help
description: "Workflow Help: explain the development workflow, available commands, and how to use them"
argument-hint: "[step name | --tdd | --full]"
model: haiku
disable-model-invocation: true
---

# Workflow Help

Display documentation and guidance for the development workflow system.

## Input

$ARGUMENTS

## Instructions

### 1. Determine what to show

- **No arguments** → Show the overview: workflow purpose, both paths (Regular and TDD), and a quick-reference command table
- **Step name** (e.g. `clarify`, `plan`, `implement`, `review`) → Show detailed help for that specific command
- **`--tdd`** → Show the full TDD path explanation with all steps
- **`--full`** → Show complete documentation for every command

---

### 2. Overview output (no arguments)

Print the following:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Development Workflow — Quick Reference
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A structured, multi-step workflow for delivering tasks
from issue intake to versioned release.

State is stored in .workflow/current-issue.md (gitignored).
Use /workflow-status at any point to see where you are.

──────────────────────────────────────────────────
  REGULAR PATH
──────────────────────────────────────────────────

  Step 1  /workflow-clarify <issue or JIRA-KEY>
          Scope the problem, define acceptance criteria,
          identify affected components, surface open questions.
          Suggests /workflow-branch when it's done.

  Step 2  /workflow-plan [--source <path|url>]
          Produce an ordered implementation plan.
          Explores codebase; read-only (Plan mode).

  Step 3  /workflow-implement
          Execute the plan step by step.
          Follows the implementation plan from Step 2.

  Step 4  /workflow-test
          Run the test suite; confirm all tests pass.

  Step 5  /workflow-review
          AI code review: correctness, style, edge cases.
          Returns ✅ Approved or ❌ Changes requested.

  Step 6  /workflow-document
          Update README, CHANGELOG draft, docblocks, etc.

  Step 7  /workflow-release [major|minor|patch] [--dry-run]
          SemVer bump, CHANGELOG commit, git tag, push.

──────────────────────────────────────────────────
  TDD PATH  (pass --tdd to /workflow-plan)
──────────────────────────────────────────────────

  Step 1  /workflow-clarify <issue>       (same as above)
  Step 2  /workflow-plan --tdd            (Red-Green-Refactor plan)
  Step 3  /workflow-test-red              (write failing tests)
  Step 4  /workflow-implement-green       (minimal passing impl)
  Step 5  /workflow-refactor              (clean up, keep green)
  Step 6  /workflow-review                (same as above)
  Step 7  /workflow-document              (same as above)
  Step 8  /workflow-release               (same as above)

──────────────────────────────────────────────────
  UTILITY COMMANDS
──────────────────────────────────────────────────

  /workflow-branch [<key or title>] [--base <branch>]
                      Cut a working branch from a freshly-fetched
                      base, named after the repo's own convention.
                      Usually run right after clarify, but valid at
                      any point — including with no .workflow/ state.
  /workflow-status    Show progress and suggest next step
  /workflow-learn     Teach the change via Socratic teach-back
                      until you can explain it (problem, solution,
                      impact). Writes .workflow/learning.md.
                      Run any time after /workflow-implement.
  /workflow-jira-report [<JIRA-KEY>] [--dry-run]
                      Post a brief report on the completed work as
                      a Jira comment. Defaults to the ticket from
                      the scratchpad when Source type is jira;
                      otherwise asks. Always confirms before posting.
  /workflow-help      This help message

──────────────────────────────────────────────────
  COMMIT HELPERS
──────────────────────────────────────────────────

  /workflow-commit [--push] [--dry-run] [--breaking] [desc]
                      Stage + single-line commit carrying the
                      branch Task ID. Never adds Co-authored-by.
  /workflow-commit-dev [--push] [--dry-run] [--breaking]
                      Commit using VERSION from .version and tag
                      dev-{version} (dev-rc{n}-{version} on RC or
                      test-RC branches).

  Lightweight companions to /workflow-release.

  All three commit-producing skills (both of the above plus
  /workflow-release) read the repo's convention first —
  commitlint config, else recent git log. Conventional repos
  get type(TASK-ID): description; the rest keep the
  TASK-ID: prefix. Undetectable repos are asked every time.
  --breaking adds ! and a BREAKING CHANGE: footer.

  All three then show you the composed message — plus the tag
  and push target where those apply — and wait for
  yes / edit / no before committing anything. An edit is used
  verbatim as the whole subject line. No flag skips this gate;
  --dry-run simply stops before reaching it.

──────────────────────────────────────────────────
  STANDALONE TOOLS
──────────────────────────────────────────────────

  /learn-code [--file <path> | --module <dir> | --commit <hash>
              | --range <a>..<b>] [--source ...]
                      Socratic teacher for any file, module,
                      commit, or commit range. Learn existing code
                      cold (not tied to the workflow).

──────────────────────────────────────────────────
  TIPS
──────────────────────────────────────────────────

  • Always start with /workflow-clarify — it seeds the
    scratchpad used by every subsequent step.

  • Run /workflow-branch right after clarify: the key and
    title are fresh, and it's the last point where cutting
    from a stale base is still free to fix.

  • /workflow-plan activates Plan mode (read-only).
    Exit Plan mode before running /workflow-implement.

  • /workflow-release supports --dry-run to preview
    the version bump, changelog, and commit before
    executing anything.

  • Use --source <path|url|Obsidian note> on clarify
    and plan to attach extra context (docs, tickets, specs).

  • Each step appends its output to .workflow/current-issue.md,
    giving every command full context of prior steps.

  • For quick commits while implementing, use /workflow-commit
    (Task ID, as prefix or scope) or /workflow-commit-dev
    (version + dev tag); /workflow-release handles the final
    versioned release.

  • After /workflow-review (or /workflow-release), use
    /workflow-jira-report to push a short status comment back
    to the Jira ticket; --dry-run previews it first.

Run /workflow-help <step> for detailed help on any step.
E.g: /workflow-help clarify
```

---

### 3. Per-step help output

When a step name is given, print a detailed block covering:

- **Purpose** — What this step achieves
- **When to run it** — Prerequisites / prior steps required
- **Key arguments** — Flags and options it accepts
- **What it reads** — Inputs it consumes
- **What it writes** — What it appends to the scratchpad
- **Model** — Which model is used (Sonnet vs Opus)
- **Suggested next step** — What to run after

Use the table below as the source of truth:

| Step | Purpose | Reads | Writes | Model | Next |
|---|---|---|---|---|---|
| `clarify` | Scope issue, define acceptance criteria | Jira / args / --source | `# Issue:` section | Sonnet | `branch`, then `plan` |
| `branch` | Cut a working branch from a freshly-fetched base (`/workflow-branch`) | scratchpad _(optional)_ + git refs | `**Branch**` / `**Base branch**` fields | Sonnet | depends on scratchpad state |
| `plan` | Create ordered implementation plan | scratchpad + codebase | `## Implementation Plan` | **Opus** | `implement` or `test-red` |
| `implement` | Execute plan step by step | scratchpad plan | `## Implementation Status` | Sonnet | `test` |
| `test` | Run test suite | scratchpad | `## Test Status` | Sonnet | `review` |
| `test-red` | Write failing tests (TDD) | scratchpad plan | `## Test Red Status` | Sonnet | `implement-green` |
| `implement-green` | Minimal impl to pass tests (TDD) | scratchpad + tests | `## Implement Green Status` | Sonnet | `refactor` |
| `refactor` | Clean up code, keep tests green (TDD) | scratchpad + codebase | `## Refactor Status` | Sonnet | `review` |
| `review` | AI code review | scratchpad + diff | `## Code Review` | **Opus** | `document` |
| `document` | Update docs and CHANGELOG draft | scratchpad | `## Documentation Status` | Sonnet | `release` |
| `release` | Version bump, tag, push — message and tag approved by you before the commit | scratchpad + CHANGELOG + repo commit convention | `## Release` | Sonnet | — |
| `status` | Show progress, suggest next step | scratchpad | _(read-only)_ | Sonnet | — |
| `learn` | Verify understanding via Socratic teach-back | scratchpad + diff | `.workflow/learning.md` | **Opus** | — |
| `jira-report` | Post a brief work report as a Jira comment (`/workflow-jira-report`) | scratchpad + git log/diff | `## Jira Report` _(+ Jira comment)_ | Sonnet | — |
| `commit` | Stage + single-line commit, Conventional or Task-ID-prefixed, approved by you before it lands (`/workflow-commit`) | branch + staged diff + repo commit convention | _(git commit)_ | Sonnet | — |
| `commit-dev` | Version-file commit + dev/RC tag, both approved by you before they land (`/workflow-commit-dev`) | `.version` + staged diff + repo commit convention | _(git commit + tag)_ | Sonnet | — |
| `learn-code` | Teach any file, module, commit, or range Socratically | codebase + history (not scratchpad) | _(none; in-conversation checklist)_ | **Opus** | — |

---

### 4. Full output (--full)

Print the overview block first, then print the per-step detail block for every step in order.
