export type StepId =
  | 'clarify'
  | 'plan'
  | 'test-red'
  | 'implement-green'
  | 'implement'
  | 'refactor'
  | 'review'
  | 'test'
  | 'document'
  | 'release'

export type Mode = 'regular' | 'tdd'

export type PlanItem = {
  n: number
  title: string
  brief: string
  files: string[]
}

/** A review finding (`[C1]`, `[W2]`, `[S3]`), settled by a later Review Fixes section or not. */
export type Finding = {
  id: string
  title: string
  state: 'open' | 'fixed' | 'declined'
}

/** An acceptance criterion's checkbox: `[ ]` open, `[x]` met, `[?]` unverified, `[!]` failed, `[~]` partly. */
export type CriterionState = 'open' | 'met' | 'unverified' | 'failed' | 'partly'

export type Criterion = {
  text: string
  state: CriterionState
}

/** Progress a skill wrote itself: "X of Y" plus the blocked step numbers. */
export type Written = { done: number; total: number; blocked: number[] }

export type Snapshot = {
  key: string | null
  title: string
  branch: string | null
  mode: Mode | null
  /** Workflow steps whose scratchpad section exists. */
  present: StepId[]
  /** Latest Code Review `**Verdict**` that no later fixes, test, document or release section answers. */
  verdict: string | null
  /** The latest Acceptance Criteria checkboxes, in scratchpad order. */
  criteria: Criterion[]
  plan: PlanItem[]
  written: Written | null
  /** Findings of the latest Code Review section. */
  findings: Finding[]
}

declare module 'claude-code' {
  interface PluginState {
    'dev-workflow': {
      snapshot: Snapshot | null
      /** The issue the edits belong to (key, else title); kept while no scratchpad exists. */
      issue: string | null
      /** Project-relative paths touched by Write/Edit this session. */
      edits: string[]
      /** The /workflow-* skill most recently started. */
      active: StepId | null
      autoOpened: boolean
      /** Model switches this session; `tokens` and `usd` sum only the warm caches they threw away. */
      switches: { count: number; tokens: number; usd: number; isGuess: boolean }
      /** Set by the first session.start; a hot reload finds it set and leaves the saved default alone. */
      started: boolean
    }
  }
}
