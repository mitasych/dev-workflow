# dev-workflow

A structured, multi-step development workflow for Claude Code, delivered as 17 explicit
skills — 16 `/workflow-*` steps and utilities, plus a standalone `/learn-code` teacher. It
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
| 1 | `/workflow-clarify <issue \| JIRA-KEY> [--source <path\|url>]` | Scope the problem, define acceptance criteria |
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
- `/workflow-branch [<issue key or short title>] [--base <branch>]` — cut a working branch from a freshly-fetched base, named after the repo's own convention. Usually run right after `clarify`, but works at any point — including with no `.workflow/` state at all
- `/workflow-status` — show progress and suggest the next step
- `/workflow-learn` — Socratic teach-back until you can explain the change you shipped
- `/learn-code [--file <path> | --module <dir> | --commit <hash> | --range <a>..<b>] [--source ...]` — standalone Socratic teacher for any existing file, module, commit, or commit range (not tied to the workflow or `.workflow/` state)
- `/workflow-help [step | --tdd | --full]` — full workflow documentation

### Commit helpers
Lightweight companions to `/workflow-release`. Both support `--push`, `--dry-run`, and
`--breaking`, and never add a `Co-authored-by` line.
- `/workflow-commit [--push] [--dry-run] [--breaking] [description]` — stage + single-line commit carrying the branch's Task ID
- `/workflow-commit-dev [--push] [--dry-run] [--breaking]` — commit using `VERSION` from `.version`, then create a `dev-{version}` tag (`dev-rc{n}-{version}` on `RC-*`/`test-RC-*` branches)

**Commit format.** All three commit-producing skills — the two above plus `/workflow-release` —
read the repo's convention before composing: a commitlint config first, then recent `git log`
subjects. Where Conventional Commits is in use the Task ID becomes the scope
(`feat(PROJ-123): add retry backoff`); otherwise it stays a prefix (`PROJ-123: Add retry
backoff`). When neither signal is present they ask — every time, recording nothing.

**Nothing commits unapproved.** All three then show you the composed message — along with the
tag and push target where those apply — and wait for `yes` / `edit` / `no`. An `edit` is taken
verbatim as the whole subject line, so a wrong type or scope costs a retype rather than a
re-run. No flag skips the gate; `--dry-run` stops before reaching it.

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
    ...                          # 17 skill dirs (14 workflow steps + 2 commit helpers + learn-code)
```
