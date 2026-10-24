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

export type Bucket = { fresh: number; cached: number; written: number; output: number }

/** `responses` counts those with tokens, a subagent's included, so a model that never cost anything reads unpriced. */
export type ModelSpend = Bucket & { usd: number; responses: number }

/**
 * What the session spent. `seen` is the last `cost.usd` read: every credit is
 * `cost.usd − seen`, so the dollars below add up to `cost.usd − seen₀`.
 */
export type Ledger = {
  seen: number
  usd: number
  /** Spend outside any response: a compaction, background calls. */
  other: number
  /** Keyed by family (`sonnet`), else by the raw model id. */
  models: Record<string, ModelSpend>
  /** Dollars per `/workflow-*` step, `none` before the first. */
  steps: Record<string, number>
  /** Tokens of subagent responses; their dollars sit in `models`. */
  subagents: Bucket
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
      /**
       * Model switches this session; `tokens` and `usd` sum only the warm caches they threw away,
       * `guesses` counts the figures among them that are guesses. Shaped: 1.11.0 kept an `isGuess` flag.
       */
      switches: Shaped<{ count: number; tokens: number; usd: number; guesses: number }>
      /**
       * The last warm-cache switch, until the first main-loop request after it measures what was
       * re-written; kept here, not in the module, so a hot reload in between doesn't lose it.
       */
      pendingSwitch: {
        e: {
          from_model: string
          to_model: string
          context_tokens: number
          prompt_cache_warm: boolean
          estimated_cache_write_usd: number
          pricing: string
        }
        lead: string | null
      } | null
      /** Set by the first session.start; a hot reload finds it set and leaves the saved default alone. */
      started: boolean
      /** What the session spent since `spendReport` was switched on; null while it is off. */
      spend: Ledger | null
    }
  }
}
