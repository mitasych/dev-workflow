---
name: workflow-branch
description: "Workflow utility: cut a working branch for the current task from a freshly-updated base, named after the repo's own convention"
argument-hint: "[<issue key or short title>] [--base <branch>]"
model: sonnet
disable-model-invocation: true
---

# Create a Working Branch

Cut the branch this task will live on, from a base that matches what the remote has right now.

The refresh is the point. A branch cut from a week-old `develop` looks completely normal until
merge time, which is the most expensive moment to discover it — by then the conflicts are baked
into every commit on the branch.

## Input

$ARGUMENTS

Everything here is optional. A bare issue key or short title seeds the branch name;
`--base <branch>` settles the base without asking.

## 1. Gather context

Stop with a one-line note if this is not a git repository.

Read `.workflow/current-issue.md` if it exists — the common case, since `/workflow-clarify`
writes it moments before you get here. Take from it:

- the issue key from `**Source**` (a `[A-Z]{2,}-\d+` match)
- the title from the `# Issue:` line
- the kind of work from `## Problem Statement`, which decides the prefix in step 3

Running without a scratchpad is equally valid — this is also how you branch for a hotfix nobody
scoped, or split a second branch off work already in flight. Take the key and title from
`$ARGUMENTS` then, and ask for whatever is missing rather than inventing it.

One case deserves a recommendation before going further: if HEAD is already on a branch carrying
this issue's key, someone cut it already. Say so and suggest staying put — but let the developer
answer, because a second branch off the same ticket is a legitimate thing to want.

## 2. Choose the base branch

Present the real candidates as an explicit list, not a fallback chain. Every one of these that
exists belongs in it:

1. **`develop`** — whenever it exists locally or as `origin/develop`. Always list it; on
   gitflow-style repos it is nearly always the right answer.
2. **The current branch** — always list it, whatever it is. Stacking a task branch on work in
   progress is common and legitimate.
3. **The remote default** — `main`/`master`, when not already covered above:
   ```bash
   git symbolic-ref --short refs/remotes/origin/HEAD
   ```
4. **Something else** — let them type a branch name.

Listing the current branch here means "cut the new branch from it", not "stay on it".

Recommend one, but let the developer pick. A branch cut from the wrong base looks completely
normal until merge time.

## 3. Propose a name

Read the convention off the repo first:

```bash
git branch -a --format='%(refname:short)'
```

Two signals decide the prefix, in this order:

- **What the repo already uses.** If `feature/` and `chore/` appear in that output and nothing
  else does, those are the house style — put them first.
- **What kind of task this is**, from the problem statement: `feature/` for new capability,
  `bugfix/` or `fix/` for defects, `hotfix/` for something urgent against production, `chore/`
  for maintenance and tooling, `release/` for release prep.

Recommend the prefix where both signals agree, list the others (including any of the six the repo
has not used yet — a repo that has never needed a `hotfix/` still allows one), and always include
an unprefixed option. Take any name the developer types verbatim.

The body of the name is the issue key, an underscore, then the title slugified — lowercase,
runs of non-alphanumerics collapsed to single hyphens:

    feature/DW-1_workflow-clarify-and-new-branch-creating
    DW-1_workflow-clarify-and-new-branch-creating          (unprefixed)

The key leads for a concrete reason: `/workflow-commit` recovers the Task ID by matching
`[A-Z]{2,}-\d+` against the branch name and prefixes every commit message with it. A `feature/`
prefix is harmless to that match; losing the key is not — every commit on the branch silently
ships without its Task ID.

When no key turned up in step 1, ask for one here rather than assuming there isn't one —
developers often know the ticket number even when the description they pasted never mentioned
it. If they supply one, treat it as the key. If they don't, propose the branch built from the
bare slug and mention once that commits on it will carry no Task ID prefix. An untracked issue
is still worth branching for; it just loses that one piece of automation.

## 4. Refresh the base before cutting

The branch has to start from what the remote has now, not from whatever was fetched days ago:

```bash
git fetch origin
git fetch origin <base>:<base>    # fast-forwards the local ref without checking it out
```

Updating the ref instead of switching to it means a dirty working tree never blocks the refresh,
and there is no branch-switching round trip. When the base is the branch already checked out, git
refuses that refspec form — use `git pull --ff-only` there.

Both forms refuse to create a merge commit. If either fails, the local base has diverged from the
remote: report what happened and ask whether to cut from the stale base anyway or stop and sort
the divergence out first. The same applies when there is no remote, the host is unreachable, or
the fetch fails for any other reason — say why, then ask. Quietly branching from an unverified
base is the exact failure this skill exists to prevent.

## 5. Handle uncommitted changes

If the working tree is dirty, show what is in it:

```bash
git status --short
```

Then ask how to proceed: stash → branch → pop, commit first (stopping here), or abandon the
branch. Do not stash on the developer's behalf — a `git stash pop` that conflicts drops them into
a conflicted tree they never asked for, in the middle of a step they thought was about naming a
branch.

## 6. Create it and record it

```bash
git switch -c <name> <base>
```

If the name already exists locally or on the remote, report the collision and ask — different
name, switch to the existing branch, or stop. Never force-move a branch someone else may be using.

Then update `**Branch**` and `**Base branch**` in `.workflow/current-issue.md` so `/workflow-plan`
and `/workflow-commit` inherit the context instead of re-deriving it. Skip this silently when
there is no scratchpad — the branch itself still carries the Task ID, which is what
`/workflow-commit` actually reads.

## Wrap up

Report the branch name and the base it was cut from, and say whether that base was successfully
refreshed or accepted as stale — that last detail is worth surfacing, since it is invisible in
`git branch` afterwards.

Then point at the next step. This skill sits at no fixed position in the workflow: it gets run
straight after `/workflow-clarify`, after `/workflow-plan` when the plan reveals the work wants a
branch of its own, or cold on a repo with no scratchpad at all. Read the state rather than
assuming the caller came from clarify:

- **No `.workflow/current-issue.md`** → nothing has been scoped yet. Suggest `/workflow-clarify`,
  and mention that it will see this branch and skip its own branching suggestion.
- **Scratchpad with no `## Implementation Plan`** → clarify has run. Suggest `/workflow-plan`.
- **Scratchpad with `## Implementation Plan`** → planning is done, and the next step follows the
  plan's `**Mode**`: `/workflow-test-red` for TDD, `/workflow-implement` for Regular. If sections
  past the plan are already present, say so and suggest `/workflow-status` rather than guessing —
  that skill owns the full step ladder and stays correct as the workflow changes.

One case is worth interrupting for: if the scratchpad's `**Source**` names a different issue than
the branch you just cut, say so plainly. Every later step appends to that one scratchpad, so the
mismatch would quietly attach one ticket's plan, review, and release notes to another ticket's
branch. Ask whether to run `/workflow-clarify` for the new issue first.
