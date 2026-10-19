---
name: workflow-status
description: "Workflow status: show current progress and suggest next step"
model: sonnet
disable-model-invocation: true
---

# Workflow Status

Show the current state of the development workflow for the active issue.

## Instructions

### 1. Read the scratchpad

Read `.workflow/current-issue.md`. If it doesn't exist, report that no workflow is active and suggest starting with `/workflow-clarify`.

### 2. Detect completed steps

Scan the scratchpad for these status sections and determine what's done:

| Section heading             | Step                              |
| --------------------------- | --------------------------------- |
| `# Issue:`                  | `/workflow-clarify`               |
| `## Implementation Plan`    | `/workflow-plan`                  |
| `## Test Red Status`        | `/workflow-test-red` (TDD)        |
| `## Implement Green Status` | `/workflow-implement-green` (TDD) |
| `## Implementation Status`  | `/workflow-implement` (Regular)   |
| `## Refactor Status`        | `/workflow-refactor` (TDD)        |
| `## Code Review`            | `/workflow-review`                |
| `## Test Status`            | `/workflow-test` (Regular)        |
| `## Documentation Status`   | `/workflow-document`              |
| `## Release`                | `/workflow-release`               |

### 3. Detect workflow mode

- If the plan has `**Mode**: TDD` → TDD workflow
- If the plan has `**Mode**: Regular` → Regular workflow
- If no plan yet → Unknown (show both paths)

### 4. Display status

```
📋 Workflow Status
━━━━━━━━━━━━━━━━━
Issue: <title from scratchpad>
Mode:  <Regular | TDD | Not yet planned>

<step1 icon> Clarify      <status detail>
<step2 icon> Plan         <status detail>
...per workflow mode...
<stepN icon> Release      <status detail>

➡️  Next: <suggested command with any relevant flags>
```

Use these icons:

- ✅ — Completed
- 🔄 — In progress (partially done)
- ⬜ — Not started
- ❌ — Blocked or failed (include reason)

### 5. Add context where helpful

- If `/workflow-review` verdict was ❌ → Show "Review requested changes, fix before continuing"
- If `/workflow-implement` has blocked steps → Show which steps are blocked
- If tests are failing → Show the count
- If open questions remain from `/workflow-clarify` → Remind about them

### 6. Suggest next step

Based on the last completed step and workflow mode, suggest the logical next command. If something needs attention (failed review, blocked steps, open questions), prioritize that over moving forward.
