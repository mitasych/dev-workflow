---
name: workflow-jira-report
description: "Workflow Utility: post a brief report on the completed work as a Jira ticket comment"
argument-hint: "[<JIRA-KEY>] [--dry-run]"
model: sonnet
disable-model-invocation: true
---

# Report to Jira

A **Workflow Utility**: summarize the work completed for the current issue and post it as a
comment on a Jira ticket.

## Input

$ARGUMENTS

Parse these from the input:

- `--dry-run` — compose and display the comment, but never post it.
- Any bare `[A-Z]{2,}-\d+` token is an explicit target ticket. If present, skip step 1's
  detection entirely and use it (still confirm before posting).

## Instructions

### 1. Determine the target ticket

Read `.workflow/current-issue.md`.

- **`**Source type**: jira`** → take the ticket key from the `**Source**` field and use it as
  the **default**. Ask the user to confirm:
  `Post the report to <KEY>? (Enter to confirm, or give another ticket key)`
  Wait for the answer — never post without it.
- **`Source type` missing, empty, or any other value (e.g. `manual`)** → do not guess a key
  from the `Source` field even if it looks like one. Ask the user:
  `Which Jira ticket should the report be posted to?`
- **No `.workflow/current-issue.md`** → say so, ask for the ticket key, and build the report
  from git history alone (step 2).

### 2. Gather what was done

- From `.workflow/current-issue.md`: the problem statement, acceptance criteria, and every
  status section present (`## Implementation Plan`, `## Implementation Status`,
  `## Test Status` / `## Test Red Status` / `## Implement Green Status`,
  `## Refactor Status`, `## Code Review`, `## Documentation Status`, `## Release`).
- From git: `git branch --show-current`, `git log main..HEAD --oneline`,
  `git diff main...HEAD --stat`.

Report only work that actually happened. Do not restate the plan as if it were done, and do
not claim tests pass unless a status section says so.

### 3. Compose the comment

Keep it **brief** — a stakeholder-readable status update, not a diff dump. Target ~10–20 lines:

```
*Done:* <one-sentence summary of the change>

*Changes*
* <change 1 — what and why>
* <change 2>

*Tests:* <what was run and the result, or "not run">
*Branch:* <branch> (<N> commits, <N> files changed)
*Status:* <e.g. Ready for review / Merged / Blocked by ...>
*Open items:* <unresolved acceptance criteria, review findings, or "none">
```

Use Jira wiki markup (`*bold*`, `*` bullets), not GitHub Markdown. Plain prose is fine if the
MCP tool expects ADF — do not hand-roll ADF JSON.

### 4. Confirm and post

1. Display the target ticket and the full comment text.
2. If `--dry-run`, STOP here.
3. Ask for explicit approval to post. Posting a comment is outward-facing — never post on an
   assumed yes.
4. Post via the available Jira/Atlassian MCP tools. If no such tool is available or the call
   fails, say so plainly and leave the comment text in the conversation for manual pasting.

### 5. Record it

On a successful post, append to `.workflow/current-issue.md`:

```markdown
## Jira Report
**Ticket**: <KEY>
**Posted**: <current date>
**Comment**: <the comment text, or a link to it if the API returned one>
```

Then report: ticket key, posted / dry-run / failed, and any open items you flagged.
