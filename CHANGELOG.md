# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] - 2026-10-19 Aleksandr Mitasov <oleksandr.mitasov@wiz-team.com>

### Added

- A live view of the current issue in Claude Code, with no model calls, read from
  `.workflow/current-issue.md`. It is Claude Code only: the skills work unchanged elsewhere, and
  Agent Plugins defines no `hooks/` location for other clients to read.
  - **A band above the prompt**, always on while a scratchpad exists: the issue, then each
    workflow step — Regular or TDD, per the plan's mode — marked done (`✓`), current (`▸`, with
    plan progress such as `~3/5` while building), failed (`✗`) or pending (`·`).
  - **`/workflow-panel`**, which shows or hides the detail: acceptance-criteria progress, every
    plan step with its status and a one-line brief, and the latest review's findings — open
    (`🔴`/`🟡`/`🔵`), fixed (`✅`, once a later `## Review Fixes` section names them) or declined
    (`➖`). It docks as a right sidebar in the fullscreen renderer at 110+ columns (`/tui
    fullscreen`); in the classic renderer it sits above the prompt, and the command says which it
    got and what to change.
  - **`autoOpen`**, a plugin option (default off) that opens the panel on the first `/workflow-*`
    skill of a session.
  - Status is *confirmed* when a skill wrote it (`Steps completed`, `Blocked steps`) and
    *inferred* — shown dim with a `~` — when a plan step's files were edited this session; a
    skill's own status replaces the guess. Edits made through `Bash`, or outside the session, are
    not seen.
- `/workflow-panel` in `/workflow-help` and the README. No existing skill's behaviour changed.

### Fixed

- `/workflow-status` named `/release` in its step table, a command that does not exist; it now
  reads `/workflow-release`.

## [1.8.0] - 2026-08-26 Aleksandr Mitasov <oleksandr.mitasov@wiz-team.com>

### Added

- A portable `plugin.json` at the repo root, conforming to [Agent Plugins
  1.0.0](https://github.com/agentplugins/agent-plugins-spec) — the vendor-neutral packaging
  standard read by ChatGPT, Codex, Cursor, GitHub Copilot, Kiro, and VS Code. It sits alongside
  the existing `.claude-plugin/plugin.json` rather than replacing it: Claude Code reads the
  latter path, the spec requires the former, and the portable schema is closed — it rejects the
  `displayName` and `skills` fields Claude Code relies on. No `SKILL.md` differs between
  clients; the `skills/<name>/SKILL.md` layout was already what the spec expects.
- Verified against `codex-cli` 0.149.0: Codex loads all 18 skills through a symlink into
  `~/.agents/skills/`, frontmatter included. The plugin deliberately keeps `model`,
  `argument-hint`, and `disable-model-invocation`, which sit outside the Agent Skills spec —
  dropping them would let an agent fire `/workflow-release` on its own, and clients ignore
  unknown keys in practice.
- README section "Other agents", documenting both routes into `~/.agents/skills/` — a direct
  clone, or a symlink to an existing Claude Code copy so one `git pull` updates both — along
  with the dual-manifest arrangement and the six fields (`name`, `version`, `description`,
  `author`, `license`, `keywords`) that must be kept identical across the two.
- README bullet for `/workflow-jira-report`, which had shipped undocumented.

### Fixed

- README no longer claims every step sets `disable-model-invocation: true`. That stopped being
  true in 1.7.3, when `/workflow-branch` became model-invocable; the "How it loads" paragraph
  now names it as the exception and notes that it always asks before cutting anything.
- Stale skill counts in the README — 18 skills and 17 `/workflow-*` commands, with the Layout
  block's breakdown corrected to 15 workflow steps + 2 commit helpers + `learn-code`.

## [1.7.3] - 2026-08-26 Aleksandr Mitasov <oleksandr.mitasov@wiz-team.com>

### Added

- `/workflow-branch` is now model-invocable — the only skill in the plugin that is. Its
  `description` carries explicit triggers (an outright request for a branch, work starting on a
  keyed ticket while HEAD sits on a base branch, or the handoff straight after
  `/workflow-clarify`) and matching anti-triggers (read-only branch questions, a branch name
  mentioned in passing, HEAD already carrying the issue's key). Every other skill keeps
  `disable-model-invocation: true`; this one sets it to `false` explicitly rather than dropping
  the key, so the exception stays visible.
- An unconditional decision gate closing section 1 of `/workflow-branch`, reached before any base
  is offered. It presents a menu rather than a yes/no — the parent story's branch first when one
  exists, then any other branch carrying the key annotated with its position relative to HEAD,
  then "cut a new branch", then "stay on the current branch" always last. Choosing to stay ends
  the skill without fetching, without moving a local ref, without switching, and without writing
  to the scratchpad. The gate runs on typed invocations too: a `SKILL.md` cannot tell how it was
  started, since a bare `/workflow-branch` presents the same empty arguments an autonomous fire
  does.

### Changed

- Section 1's existing checks no longer ask anything on their own. The "HEAD is already on it"
  and "it exists elsewhere" branches now record findings that the gate consumes as rows, so
  exactly one place in the skill asks whether to branch. The parent-story search feeds the same
  menu instead of making a competing offer.
- Section 5's "abandon the branch" is now described as the gate's answer arriving late, so a
  dirty tree does not produce a second version of a question already asked.
- Plugin description no longer claims every step is an explicit `/workflow-*` skill, which
  stopped being true once branch creation could be offered automatically.

## [1.7.2] - 2026-08-22 Aleksandr Mitasov <oleksandr.mitasov@wiz-team.com>

### Added

- Commit message approval gate in `/workflow-commit`, `/workflow-commit-dev`, and
  `/workflow-release`: each skill now shows the composed message — along with the tag and push
  target where those apply — and waits for `yes` / `edit` / `no` before committing anything. An
  `edit` is taken verbatim as the whole subject line, so a wrong type or scope costs a retype
  rather than a re-run. The gate is unconditional: no flag skips it, and `--dry-run` stops
  before reaching it.

### Changed

- `/workflow-release` now checks tag availability in section 6, ahead of the approval gate,
  instead of after the commit — so it can no longer offer a tag it is about to fail to create.

## [1.7.1] - 2026-08-21 Aleksandr Mitasov <oleksandr.mitasov@wiz-team.com>

### Added

- Conventional Commits support in `/workflow-commit`, `/workflow-commit-dev`, and
  `/workflow-release`: each skill detects a commitlint config or matching repo history and
  offers `type(scope): description` formatting, with the Task ID as the scope, `!` +
  `BREAKING CHANGE:` footer support for breaking changes, and a stateless prompt fallback
  when no convention is detected.

### Fixed

- Commit-style detection no longer infers house style from non-conventional history alone.
  The prior check used an absolute count of conventional subjects out of the last 20, which
  could never trigger in a repo with fewer than 12 commits — a young repo whose every commit
  was a valid Conventional Commit would have hit the prompt forever. Replaced with a
  percentage-of-returned-subjects threshold (60%) and a minimum-sample floor (under 3 commits,
  no signal either way).
