# dev-workflow

A structured, multi-step development workflow for Claude Code, delivered as 18 explicit
skills — 17 `/workflow-*` steps and utilities, plus a standalone `/learn-code` teacher. It
carries a task from issue intake to a versioned release, keeping
shared state in `.workflow/current-issue.md` (gitignored) inside whatever project you run
it in.

## How it loads

### Install as a plugin

The repository is its own marketplace (`.claude-plugin/marketplace.json`). At the prompt of a
terminal session:

```
/plugin install dev-workflow --marketplace https://gitlab.wiz-team.com/ai-tools/dev-workflow.git
```

Answer `y` to add the marketplace, then pick a scope (user is the default). From a shell, the same
line is `claude plugin install dev-workflow --marketplace <url>`. With an SSH key rather than an
HTTPS credential, use `ssh://git@gitlab.wiz-team.com:2233/ai-tools/dev-workflow.git`. The install
never prompts for a credential, so the machine must already hold one for that host.

It then loads as **`dev-workflow@dev-workflow`** from the copy the install made.

**Updates.** A new release reaches an install only when the manifest `version` changes — every
release bumps it. Auto-update is off by default for marketplaces outside Anthropic's own; turn it on
in `/plugin` → **Marketplaces** → `dev-workflow` → **Enable auto-update** (or `"autoUpdate": true` on
the marketplace's `extraKnownMarketplaces` entry in settings). It then runs in the background after
the first message of a session, and `/reload-plugins` applies it. By hand:
`claude plugin update dev-workflow@dev-workflow`, then `/reload-plugins`. Background updates use
your git credential without prompting, so keep an SSH key in the agent or a stored HTTPS credential.

### Or from a skills directory

Cloned into a personal skills directory (`~/.claude/skills/dev-workflow`), Claude Code
auto-loads it every session as **`dev-workflow@skills-dir`**, with no install step, and edits take
effect in new sessions.

**Use one or the other.** With both present, the installed copy wins and the skills-directory copy
shows as *Not loaded* in `/plugin` — so edits to the folder stop taking effect. Uninstall one, or
move the folder out of the skills directory.

Every step but one has `disable-model-invocation: true`, so you invoke it explicitly (e.g.
`/workflow-clarify`). The exception is `/workflow-branch`, which Claude may offer on its
own — and which always asks before cutting anything.

To confirm it loaded: `/plugin` → look for `dev-workflow@dev-workflow` (or `@skills-dir`), or
just type `/workflow-` and check the completions.

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
- `/workflow-panel` — show or hide a live side panel of the current issue's steps and plan steps (Claude Code only). It docks as a right sidebar in the fullscreen renderer — run `/tui fullscreen` once — and sits above the prompt otherwise; see [Status panel](#status-panel-claude-code-only)
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

## Status panel (Claude Code only)

A small Claude Code mod, kept whole in `panel/`, watches `.workflow/current-issue.md` and draws it,
with no model calls. Only the Claude Code manifest points at it (`hooks`, `types`), so Cursor, Codex,
and Copilot do not read it; the skills work there unchanged, without the panel.

- **Band** — always above the prompt while a scratchpad exists: the issue, then the workflow steps
  (Regular or TDD, per the plan's mode) as `✓clarify ✓plan ▸implement ~3/5 ·review …` — ✓ done,
  ▸ current (with plan progress while building), ✗ failed, · pending.
- **Panel** — `/workflow-panel` shows or hides the detail: acceptance-criteria progress (a count per
  state, then each criterion not yet met), every plan
  step with its status (plus a one-line brief when there is room), and the latest review's findings
  — 🔴/🟡/🔵 while open, ✅ once a later `## Review Fixes` section names them, ➖ where it says they
  were declined. It is a **right sidebar** in Claude Code's fullscreen renderer at 110+ columns —
  switch with `/tui fullscreen`, or start with `CLAUDE_CODE_NO_FLICKER=1 claude`. In the classic
  renderer, or a narrower terminal, it sits above the prompt and lists only open findings. The
  command says which it got and what to change.
- **`autoOpen`** (plugin option, default off) — open the panel on the first `/workflow-*` skill of a session.
- **Criteria markers** — `/workflow-test` and `/workflow-review` set the checkbox of each item under
  `## Acceptance Criteria`: `[x]` met, `[!]` failed, `[~]` partly, `[?]` unverified, `[ ]` open. Only the
  bracket character changes, and the latest run wins, hand-set ticks included. The panel shows them as
  ✅ met, ❌ failed, 🌓 partly, 🔍 unverified, ⬜ open — a colored count line, then each criterion not met.
  A scratchpad with only `[ ]` and `[x]` boxes counts as before.

Status is either *confirmed* — what a skill wrote (`Steps completed: X of Y`, `Blocked steps`) — or
*inferred*, shown dim with a `~`: a plan step whose `**Files**` were edited this session. A skill's own
status replaces the guess once written. Edits made through `Bash`, or outside the session, aren't seen.

Where an organization manages Claude Code, hooks on `skill.prompt` only run for plugins the organization
lists, so the panel then refreshes from file edits and a 3-second poll instead of on skill start.

## Layout

```
~/.claude/skills/dev-workflow/
  plugin.json                    # portable manifest (Agent Plugins 1.0.0)
  .claude-plugin/plugin.json     # Claude Code manifest (name, version, "skills": "./skills/")
  panel/                         # Claude Code mod (status band + panel), all of it:
    hooks.json                   #   names register.tsx; the manifest's "hooks" points here
    register.tsx parse.ts view.ts
    types.d.ts                   #   the mod's $.state contract (manifest "types")
    tests/                       #   parser, view, and module tests (claude plugin test .)
  skills/
    workflow-clarify/SKILL.md
    workflow-plan/SKILL.md
    ...                          # 18 skill dirs (15 workflow steps + 2 commit helpers + learn-code)
```
