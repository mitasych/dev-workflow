# dev-workflow

A structured, multi-step development workflow for Claude Code, delivered as 16 explicit
skills — 15 `/workflow-*` steps and utilities, plus a standalone `/learn-code` teacher. It
carries a task from issue intake to a versioned release, keeping
shared state in `.workflow/current-issue.md` (gitignored) inside whatever project you run
it in.

## How it loads

This folder lives in a personal skills directory, so Claude Code auto-loads it every
session as the plugin **`dev-workflow@skills-dir`** — no `/plugin install` step. Every
step has `disable-model-invocation: true`, so Claude never fires one on its own; you
invoke each explicitly (e.g. `/workflow-clarify`).

To confirm it loaded: `/plugin` → look for `dev-workflow@skills-dir`, or just type
`/workflow-` and check the completions.

## Commands

### Regular path
| Step | Command | Purpose |
|------|---------|---------|
| 1 | `/workflow-clarify <issue \| JIRA-KEY> [--source <path\|url>]` | Scope the problem, define acceptance criteria, optionally cut a working branch |
| 2 | `/workflow-plan [--tdd] [--source ...]` | Produce an ordered implementation plan |
| 3 | `/workflow-implement` | Execute the plan step by step |
| 4 | `/workflow-test` | Run the test suite |
| 5 | `/workflow-review` | AI code review: correctness, style, edge cases |
| 6 | `/workflow-document` | Update README / CHANGELOG draft / docblocks |
| 7 | `/workflow-release [major\|minor\|patch] [--dry-run]` | SemVer bump, changelog commit, tag, push |

### TDD path (`/workflow-plan --tdd`)
`clarify` → `plan --tdd` → `/workflow-test-red` → `/workflow-implement-green` →
`/workflow-refactor` → `review` → `document` → `release`

### Utilities
- `/workflow-status` — show progress and suggest the next step
- `/workflow-learn` — Socratic teach-back until you can explain the change you shipped
- `/learn-code [--file <path> | --module <dir> | --commit <hash> | --range <a>..<b>] [--source ...]` — standalone Socratic teacher for any existing file, module, commit, or commit range (not tied to the workflow or `.workflow/` state)
- `/workflow-help [step | --tdd | --full]` — full workflow documentation

### Commit helpers
Lightweight companions to `/workflow-release`. Both support `--push` and `--dry-run`, and
never add a `Co-authored-by` line.
- `/workflow-commit [--push] [--dry-run] [description]` — stage + single-line commit prefixed with the branch's Task ID (e.g. `PROJ-123: …`)
- `/workflow-commit-dev [--push] [--dry-run]` — commit using `VERSION` from `.version`, then create a `dev-{version}` tag (`dev-rc{n}-{version}` on `RC-*`/`test-RC-*` branches)

## State

Each step appends to `.workflow/current-issue.md` in the current project, so every step has
the full context of prior steps. `clarify` also creates `.workflow/.gitignore` (`*`) so this
state is never committed. This is **project-local** state by design — intentionally not
stored in plugin data.

## Layout

```
~/.claude/skills/dev-workflow/
  .claude-plugin/plugin.json     # plugin manifest (name, version, "skills": "./skills/")
  skills/
    workflow-clarify/SKILL.md
    workflow-plan/SKILL.md
    ...                          # 16 skill dirs (13 workflow steps + 2 commit helpers + learn-code)
```
