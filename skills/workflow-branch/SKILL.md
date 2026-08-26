---
name: workflow-branch
description: "Workflow utility: cut a working branch for the current task from a verified base, named after the repo's own convention. TRIGGER when the developer asks for a branch ('create a branch', 'cut a branch for DW-5', 'branch off develop'), when work starts on a keyed ticket while HEAD sits on a base branch ('let's implement DW-5' from main), or immediately after /workflow-clarify writes a fresh scratchpad. SKIP read-only branch questions ('what branch am I on', 'list branches'), a branch name mentioned in passing, and any time HEAD already carries the issue's key."
argument-hint: "[<issue key or short title>] [--base <branch>]"
model: sonnet
disable-model-invocation: false
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

## 1. Gather context and confirm intent

Stop with a one-line note if this is not a git repository.

Read `.workflow/current-issue.md` if it exists — the common case, since `/workflow-clarify`
writes it moments before you get here. Take from it:

- the title from the `# Issue:` line — but prefer the work actually in front of you when that
  title has drifted. A scratchpad scoped a while back tends to name the ticket's opening problem
  rather than what this branch will hold, and a name built from it can land close enough to an
  existing branch to be unreadable at a glance.
- the kind of work from `## Problem Statement`, which decides the prefix in step 3

Running without a scratchpad is equally valid — this is also how you branch for a hotfix nobody
scoped, or split a second branch off work already in flight. Take the key and title from
`$ARGUMENTS` then, and ask for whatever is missing rather than inventing it.

With nothing supplied at all — no scratchpad, no arguments, no key — the repo is still evidence.
`git status --short` and `git diff --stat` name the files being worked on, and recent commit
subjects show what the repo has been doing lately. Propose a name from that and have it confirmed;
an empty "what should I call this branch?" hands the developer back a question they came here to
answer.

### Find the issue key

The key is worth hunting for rather than asking about, since it is what `/workflow-commit` later
reads back out of the branch name. Check all of these before concluding there isn't one, taking
the first `[A-Z]{2,}-\d+` that turns up:

1. **`$ARGUMENTS`**, when the developer named one outright.
2. **The scratchpad's `**Source**` line**
3. **The scratchpad's `**Branch**` line** — clarify may have recorded a branch that already
   carries the key even when `**Source**` names the ticket another way.
4. **Recent commit subjects** — `git log -10 --format='%s'`. A repo whose last commits all read
   `PROJ-42: …` is stating the key plainly.

Stopping at `**Source**` is the mistake worth naming: trackers write their references in forms
the pattern never matches — `GitLab issue group/repo#1`, a bare URL, a plain title — while the
key sits in view one line below or in every recent commit.

### Check for a parent story

A subtask is rarely worth its own branch. The story is what gets reviewed and merged; splitting
its subtasks across five branches turns one review into five, each showing a fragment that does
not stand on its own.

So when the issue is a subtask, find its parent — step 3 offers it as a second name.

1. **The scratchpad's `**Parent**` line**, which `/workflow-clarify` writes when it fetched the
   ticket from Jira.
2. **A live lookup** — only when that line is absent, the key is Jira-shaped, and a Jira/Atlassian
   MCP tool is already available in this session. One call, and never a blocker: if it fails, or
   no such tool exists, carry on with the subtask's own key and say nothing. This is git work; it
   does not stall on a tracker, and it never asks the developer to go set one up.

Two things must both hold for a parent to matter:

- the issue is genuinely a **subtask** (`issuetype.subtask` is true, or the tracker says as much), and
- the parent is a **story or task, not an epic**. Jira records the epic in `parent` for ordinary
  stories too, so "has a parent" is not the test. An epic spans weeks and many stories; a branch
  named after one would outlive every task on it. When the parent is an epic, ignore it entirely.

With no key, no tracker, and no scratchpad there is nothing to check — skip this without comment.

### Check whether the branch already exists

Someone may have cut it already, before clarify ran or on another machine:

```bash
git branch -a --format='%(refname:short)' | grep -iE '(^|[^A-Za-z0-9])<key>([^0-9]|$)'
```

The boundaries earn their keep once ticket numbers reach double digits — a bare `grep -i 'DW-1'`
also matches every `DW-10` and `DW-11` branch in the repo.

Search every ref, local and remote — not just HEAD. A branch for this key sitting unnoticed on
the remote is the case that actually costs something: cut a second one and the ticket's work
splits across two branches that each look perfectly correct in isolation.

Record what turns up; the decision belongs to the gate below, not here.

- **HEAD is already on it** → note it. The gate will recommend staying put.
- **It exists elsewhere** → note its name and how it sits relative to HEAD
  (`git rev-list --left-right --count HEAD...<branch>`). Compare against HEAD rather than the
  base — step 2 has not chosen a base yet. It becomes a row in the gate.

A second branch off the same ticket is a legitimate thing to want, so an existing branch is never
a reason to stop here — it is a row the developer can pick or ignore.

Run the same search for the parent story's key when one turned up above. An existing story branch
is the strongest reason in this skill not to cut anything: the subtask's work belongs on it, and
cutting a sibling is how one story ends up with two half-finished branches. It leads the gate's
rows for that reason.

### Decide whether to branch

Everything above is a read. This is the decision, and it happens **every time** — including when
the developer typed `/workflow-branch` themselves.

Unconditional is deliberate. A `SKILL.md` cannot tell how it was invoked: a bare typed
`/workflow-branch` arrives with exactly the empty `$ARGUMENTS` an autonomous fire does, so "ask
only when the model started this" is not something this file can express. What keeps it from
being a pointless question to someone who just typed the command is that it is a decision menu,
not a yes/no — the rows carry the findings from above, which they do not have yet.

    DW-4 — "make workflow-branch model-invocable"
    No existing branch carries this key.

      1. Cut a new branch          → continues to the base and name questions
      2. Stay on main

Rows, in this order:

1. **The parent story's branch**, when the search above found one — recommended, and first,
   because the subtask's work belongs on it.
2. **Any other branch carrying the key**, annotated with how it sits relative to HEAD.
3. **Cut a new branch** — always present.
4. **Stay on `<current branch>`** — always present, always last.

When HEAD is *already* on a branch carrying the key, say so plainly and recommend staying; the
work has somewhere to live, and a sibling would split it.

**Staying put ends the skill.** Do not `git fetch origin`, do not run
`git fetch origin <base>:<base>` (it moves a local ref), do not `git switch`, and do not write to
the scratchpad. Report the branch HEAD is on and stop — nothing needs undoing afterwards.

## 2. Choose the base branch

If `--base <branch>` was passed, that settles it: confirm the branch exists and go to step 3
without asking. The list below is for when it wasn't — offering a menu after the developer
already named their base is the kind of question that teaches people to stop passing flags.

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
   That ref goes unset on plenty of ordinary clones, and an empty answer means "unknown", not
   "there isn't one". Check whether `origin/main` or `origin/master` exists and use whichever
   does, rather than dropping the candidate — losing it can leave the list with nothing in it
   but the branch already checked out, which is not a choice.
4. **Something else** — let them type a branch name.

Listing the current branch here means "cut the new branch from it", not "stay on it".

Recommend one, but let the developer pick. A branch cut from the wrong base looks completely
normal until merge time.

## 3. Propose a name

Read the convention off the repo first:

```bash
git branch -a --format='%(refname:short)'
```

### The prefix

Work through these in order. The repo scan shapes the *recommendation*; it never shrinks the menu.

**a. Collect the prefixes the repo already uses** — the distinct segments before a `/` in that
output. These are the house style, and where one already covers this kind of work, prefer its
spelling: `fix/` over `bugfix/` if that is what the repo says.

**b. Read the kind of work off the problem statement** and map it to its conventional prefix:

| Kind of work | Prefix |
|---|---|
| New capability | `feature/` |
| Defect in existing behaviour | `bugfix/` or `fix/` |
| Urgent fix against production | `hotfix/` |
| Maintenance, tooling, dependencies, docs | `chore/` |
| Release preparation | `release/` |

With no problem statement to read, take the kind of work from the diff instead — new files under a
feature directory read differently from a one-line change in an error path.

**c. If the repo uses no prefixes at all**, settle that first: ask whether this branch should
carry one, noting that the existing branches don't. An unprefixed repo is a convention, not an
oversight — but it is the developer's to confirm, not yours to assume in either direction.

**d. Present the whole table and recommend the row matching this task** — including prefixes the
repo has never used. This is the step that quietly collapses: narrowing the menu to whatever
`git branch` returned looks tidy and considerate, and it removes exactly the option the developer
needed. A repo that has never cut a `hotfix/` still allows one, and someone fixing production at
2am should not have to recall the convention unaided. Mark which rows the repo already uses so
the house style stays visible without becoming a fence.

Always include an unprefixed option, and take any name the developer types verbatim.

### The body

The body of the name is the issue key, an underscore, then the title slugified — lowercase,
runs of non-alphanumerics collapsed to single hyphens:

    feature/DW-1_workflow-clarify-and-new-branch-creating
    DW-1_workflow-clarify-and-new-branch-creating          (unprefixed)

The key leads for a concrete reason: `/workflow-commit` recovers the Task ID by matching
`[A-Z]{2,}-\d+` against the branch name and prefixes every commit message with it. A `feature/`
prefix is harmless to that match; losing the key is not — every commit on the branch silently
ships without its Task ID.

When step 1 found a story parent, offer both bodies — the prefix is already settled, so this is one
menu of two — and recommend the parent's:

    feature/DW-2_payment-retry-flow      ← the parent story (recommended)
    feature/DW-5_add-retry-backoff       ← this subtask alone

Both rows, always. The story name is an addition to the menu, never a substitution: a subtask that
genuinely stands alone, or one being handed to someone else, wants its own branch.

Say what neither name shows: by that same Task ID rule, the story branch prefixes every commit
`DW-2:` and the subtask key never reaches the history. That is usually the right trade — the story
is the unit of work — but a team tracking progress per subtask will want the opposite. If they want
both keys in view, `feature/DW-2_DW-5_add-retry-backoff` works; the first key still wins the prefix.

When no key turned up in step 1, ask for one here rather than assuming there isn't one —
developers often know the ticket number even when the description they pasted never mentioned
it. If they supply one, treat it as the key. If they don't, propose the branch built from the
bare slug and mention once that commits on it will carry no Task ID prefix. An untracked issue
is still worth branching for; it just loses that one piece of automation.

## 4. Refresh the base before cutting

The branch has to start from what the remote has now, not from whatever was fetched days ago.
Update the remote refs first, then read where the base actually stands:

```bash
git fetch origin
git rev-list --left-right --count <base>...origin/<base>
```

The two numbers are commits the base has that the remote lacks, then commits the remote has that
the base lacks. All four combinations are ordinary; only the last is a problem:

| Base ahead | Remote ahead | Meaning | What to do |
|---|---|---|---|
| 0 | 0 | already current | nothing to fast-forward — go to step 5 |
| 0 | N | behind | fast-forward it, below |
| N | 0 | ahead by N unpushed commits | nothing to refresh — report it and cut |
| N | M | genuinely diverged | stop and ask |

The `N`/`0` row is worth stating outright, because the instinct is to read any non-zero count as
staleness and "refresh" it. Attempting the fast-forward there asks git to rewind the base past
commits that exist nowhere else, which it refuses — and relaying that refusal as a stale base
sends the developer to fix something that is not broken. Unpushed local commits are the freshest
base available, not the most dangerous one.

When the base is behind, fast-forward it:

```bash
git fetch origin <base>:<base>    # moves the local ref without checking it out
```

Updating the ref instead of switching to it means a dirty working tree never blocks the refresh,
and there is no branch-switching round trip. When the base is the branch already checked out, git
refuses that refspec form — use `git pull --ff-only` there.

Both forms refuse to create a merge commit. If the count came back `N`/`M`, or the fast-forward
fails anyway, the base and the remote have each moved independently: report both numbers and ask
whether to cut from it regardless or stop and sort the divergence out first. The same applies
when the host is unreachable or the fetch fails for any other reason — say why, then ask. Quietly
branching from an unverified base is the exact failure this skill exists to prevent.

A base with no counterpart on the remote is a different case, and not an error: a purely local
branch, or a repo with no remote at all, has nothing to be stale against. Say that it could not
be checked against a remote, then carry on without asking.

## 5. Handle uncommitted changes

A dirty tree only obstructs anything when the base is *not* the branch already checked out.
`git switch -c <name> <base>` carries uncommitted changes across untouched unless they collide
with the difference between HEAD and the base — and when the base is HEAD, which is how most
branches get cut, there is no difference to collide with. Say nothing and go to step 6 there.
Asking about a stash that was never needed interrupts the developer to decline an offer.

When the base is something other than HEAD, show what is in the tree first:

```bash
git status --short
```

Then ask how to proceed: stash → branch → pop, commit first (stopping here), or abandon the
branch. Do not stash on the developer's behalf — a `git stash pop` that conflicts drops them into
a conflicted tree they never asked for, in the middle of a step they thought was about naming a
branch.

"Abandon the branch" here is the same answer as "stay put" at the §1 gate, arriving late — the
developer has since chosen a base and a name. Treat it as such: stop, change nothing, and do not
re-ask the gate's question.

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

Report the branch name and the base it was cut from, along with which of these happened to that
base: **fast-forwarded**, **already current**, **unverifiable** (no remote counterpart), or
**accepted as stale**. That detail is worth spelling out because it is invisible in `git branch`
afterwards, and the four are not interchangeable — only the last one is a known risk being taken
deliberately.

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
