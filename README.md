# dev-workflow

A structured, multi-step development workflow for Claude Code, delivered as 18 explicit
skills — 17 `/workflow-*` steps and utilities, plus a standalone `/learn-code` teacher. It
carries a task from issue intake to a versioned release, keeping
shared state in `.workflow/current-issue.md` (gitignored) inside whatever project you run
it in.

## How it loads

This folder lives in a personal skills directory, so Claude Code auto-loads it every
session as the plugin **`dev-workflow@skills-dir`** — no `/plugin install` step. Every
step but one has `disable-model-invocation: true`, so you invoke it explicitly (e.g.
`/workflow-clarify`). The exception is `/workflow-branch`, which Claude may offer on its
own — and which always asks before cutting anything.

To confirm it loaded: `/plugin` → look for `dev-workflow@skills-dir`, or just type
`/workflow-` and check the completions.

### Other agents

The plugin also ships a root `plugin.json` conforming to [Agent Plugins
1.0.0](https://github.com/agentplugins/agent-plugins-spec) — the vendor-neutral packaging
standard read by ChatGPT, Codex, Cursor, GitHub Copilot, Kiro, and VS Code. The
`skills/<name>/SKILL.md` layout is already exactly what that spec expects, so no skill file
differs between clients.

Those clients read `~/.agents/skills/`, not `~/.claude/skills/`. Install there directly:

```bash
git clone ssh://git@gitlab.wiz-team.com:2233/ai-tools/dev-workflow.git ~/.agents/skills/dev-workflow
```

Or, if you already run it in Claude Code, symlink that copy instead of cloning a second one —
then a `git pull` updates both at once:

```bash
ln -s ~/.claude/skills/dev-workflow ~/.agents/skills/dev-workflow
```

Either way Codex picks up all 18 skills — verified against `codex-cli` 0.149.0.

Two manifests coexist by necessity: Claude Code reads `.claude-plugin/plugin.json`, the spec
requires `plugin.json` at the root, and the portable schema is closed — it rejects the
`displayName` and `skills` fields Claude Code uses. **`name`, `version`, `description`,
`author`, `license`, and `keywords` appear in both and must be kept identical.**

Skill frontmatter deliberately keeps `model`, `argument-hint`, and `disable-model-invocation`,
which sit outside the Agent Skills spec. Clients ignore unknown keys in practice — Cursor's own
skills use `disable-model-invocation` — and dropping it would let an agent fire
`/workflow-release` on its own. Portability is not worth that.

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
- `/workflow-branch [<issue key or short title>] [--base <branch>]` — cut a working branch from a freshly-fetched base, named after the repo's own convention. Usually run right after `clarify`, but works at any point — including with no `.workflow/` state at all. This is the one workflow skill Claude can invoke on its own — when you ask for a branch, when work starts on a keyed ticket from a base branch, or straight after `clarify` — and it always asks before cutting, with a "stay put" option that touches nothing
- `/workflow-status` — show progress and suggest the next step
- `/workflow-learn` — Socratic teach-back until you can explain the change you shipped
- `/workflow-jira-report [<JIRA-KEY>] [--dry-run]` — summarize the completed work and post it as a Jira ticket comment
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
  plugin.json                    # portable manifest (Agent Plugins 1.0.0)
  .claude-plugin/plugin.json     # Claude Code manifest (name, version, "skills": "./skills/")
  skills/
    workflow-clarify/SKILL.md
    workflow-plan/SKILL.md
    ...                          # 18 skill dirs (15 workflow steps + 2 commit helpers + learn-code)
```
