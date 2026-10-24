import type { Bucket, Ledger, ModelSpend } from './types'

export type ModelSwitch = 'off' | 'suggest' | 'upgrade' | 'multi-turn' | 'always'

export type Family = 'haiku' | 'sonnet' | 'opus' | 'fable'

export type Decision = { kind: 'none' } | { kind: 'suggest' | 'switch'; model: string }

/** The fields of a PostModelSwitch hook's input the cost report reads. */
export type SwitchEvent = {
  from_model: string
  to_model: string
  context_tokens: number
  prompt_cache_warm: boolean
  estimated_cache_write_usd: number
  pricing: string
}

/** What the first request after a switch read from and wrote to the cache. */
export type CacheUsage = {
  model: string
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// `guesses`: the figures in the total that are guesses (priced at Claude Code's default rate, or never measured).
export type SwitchTotal = { count: number; tokens: number; usd: number; guesses: number }

export type SpendReport = 'off' | 'total' | 'model' | 'step'

/** The token counts of one response, as a `turn.step` stop chunk reports them. */
export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export type { Bucket, Ledger, ModelSpend }

export const MODEL_SWITCH_VALUES: readonly ModelSwitch[] = ['off', 'suggest', 'upgrade', 'multi-turn', 'always']

export const SPEND_REPORT_VALUES: readonly SpendReport[] = ['off', 'total', 'model', 'step']

export const NO_SWITCHES: SwitchTotal = { count: 0, tokens: 0, usd: 0, guesses: 0 }

const RANK: Record<Family, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }

export const readSetting = (value: unknown): ModelSwitch =>
  MODEL_SWITCH_VALUES.find(v => v === value) ?? 'off'

export const readSpendReport = (value: unknown): SpendReport =>
  SPEND_REPORT_VALUES.find(v => v === value) ?? 'off'

// An alias (`opus`, `opus[1m]`), a full id (`claude-opus-5-5`) or a display
// name (`Opus 5.5`); `best` is the fable alias. Anything else, `opusplan` and
// `default` included, is no family.
export const family = (model: string): Family | null => {
  const id = model.toLowerCase()
  if (/^best(\[|$)/.test(id)) return 'fable'
  const m = /(?:^|[^a-z])(haiku|sonnet|opus|fable)(?:[^a-z]|$)/.exec(id)

  return m ? (m[1] as Family) : null
}

export const decide = (input: {
  setting: ModelSwitch
  skillModel: unknown
  sessionModel: string
  isMultiTurn: boolean
}): Decision => {
  const { setting, skillModel, sessionModel, isMultiTurn } = input
  if (setting === 'off' || typeof skillModel !== 'string') return { kind: 'none' }
  const target = family(skillModel)
  const current = family(sessionModel)
  if (target === null || current === null || target === current) return { kind: 'none' }
  if (setting === 'suggest') return { kind: 'suggest', model: skillModel }
  const isAllowed =
    setting === 'always' || (setting === 'upgrade' ? RANK[target] > RANK[current] : isMultiTurn)

  return isAllowed ? { kind: 'switch', model: skillModel } : { kind: 'none' }
}

// The `[1m]` of `opus[1m]`: a variant the person picks on purpose.
const variant = (model: string): string => /\[[^\]]*\]$/.exec(model.toLowerCase())?.[0] ?? ''

/**
 * Whether the saved default is still the one the mod wrote. The row may report
 * an alias as its full id, so the family decides, but a different variant of it
 * (`opus` → `opus[1m]`) is the person's own choice.
 */
export const isStillOurs = (current: string, wrote: string): boolean =>
  current === wrote || (family(current) !== null && family(current) === family(wrote) && variant(current) === variant(wrote))

const command = (skill: string): string => `/${skill.split(':').pop() ?? skill}`

const short = (model: string): string => family(model) ?? model

export const switchToast = (skill: string, model: string): string => `Model → ${short(model)} for ${command(skill)}`

// The question `suggest` puts to the person before the skill's prompt is sent.
export const askPrompt = (skill: string, model: string, sessionModel: string) => ({
  question: `${command(skill)} runs on ${short(model)}. Switch this session to ${short(model)} too? It is on ${short(sessionModel)}.`,
  header: 'Model',
  switch: `Switch to ${short(model)}`,
  stay: `Stay on ${short(sessionModel)}`,
})

const tokens = (n: number): string => (n < 1000 ? String(n) : n < 999_500 ? `${Math.round(n / 1000)}k` : `${(n / 1e6).toFixed(1)}M`)

const exact = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const usd = (n: number): string => (n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`)

// A switch before the first response re-sends nothing: no toast, no count.
// `lead` replaces the `from → to` head, where the toast already says why the model changed.
export const costLine = (e: SwitchEvent, lead = `${short(e.from_model)} → ${short(e.to_model)}`): string | null => {
  if (e.context_tokens === 0) return null
  if (!e.prompt_cache_warm) return `${lead} · cache already cold, nothing lost`

  return `${lead} · re-cache up to ${exact(e.context_tokens)} tokens ≈ ${usd(e.estimated_cache_write_usd)}${
    e.pricing === 'default' ? ' (rough guess)' : ''
  } — measuring…`
}

// The estimate prices the whole conversation; the first request after the switch
// says what was re-written (a model whose cache is still warm re-writes little).
export const isMeasurable = (e: SwitchEvent, usage: CacheUsage): boolean =>
  e.prompt_cache_warm && e.context_tokens > 0 && family(usage.model) === family(e.to_model)

const measuredUsd = (e: SwitchEvent, usage: CacheUsage): number =>
  (usage.cache_creation_input_tokens * e.estimated_cache_write_usd) / e.context_tokens

export const measuredLine = (e: SwitchEvent, usage: CacheUsage, lead = `${short(e.from_model)} → ${short(e.to_model)}`): string => {
  const written = usage.cache_creation_input_tokens
  const prompt = usage.cache_read_input_tokens + written

  return `${lead} · re-cached ${exact(written)} of ${exact(prompt)} tokens ≈ ${usd(measuredUsd(e, usage))}${
    e.pricing === 'default' ? ' (rough guess)' : ''
  } (measured)`
}

// Swaps the estimate addSwitch counted for what the request wrote.
export const measureSwitch = (total: SwitchTotal, e: SwitchEvent, usage: CacheUsage): SwitchTotal => ({
  ...total,
  tokens: Math.max(0, total.tokens + usage.cache_creation_input_tokens - e.context_tokens),
  usd: Math.max(0, total.usd + measuredUsd(e, usage) - e.estimated_cache_write_usd),
})

const isPricedGuess = (e: SwitchEvent): boolean => e.prompt_cache_warm && e.pricing === 'default'

// A switch the next one overtook before any request: the model in between cached
// nothing, so its estimate (and any guess in it) comes off the total and the switch stays counted.
export const skipSwitch = (total: SwitchTotal, e: SwitchEvent): SwitchTotal => ({
  ...measureSwitch(total, e, { model: e.to_model, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
  guesses: Math.max(0, total.guesses - (isPricedGuess(e) ? 1 : 0)),
})

// A switch whose first request ran on another model: its estimate stays, now a guess.
export const guessSwitch = (total: SwitchTotal, e: SwitchEvent): SwitchTotal =>
  isPricedGuess(e) ? total : { ...total, guesses: total.guesses + 1 }

export const addSwitch = (total: SwitchTotal, e: SwitchEvent): SwitchTotal =>
  e.context_tokens === 0
    ? total
    : {
        count: total.count + 1,
        tokens: total.tokens + (e.prompt_cache_warm ? e.context_tokens : 0),
        usd: total.usd + (e.prompt_cache_warm ? e.estimated_cache_write_usd : 0),
        guesses: total.guesses + (isPricedGuess(e) ? 1 : 0),
      }

export const totalLine = (total: SwitchTotal): string | null =>
  total.count === 0
    ? null
    : `Switches: ${total.count} · ${total.tokens > 0 ? `${tokens(total.tokens)} tokens ` : ''}≈ ${usd(total.usd)}${
        total.guesses > 0 ? ' (rough guess)' : ''
      }`

const NO_TOKENS: Bucket = { fresh: 0, cached: 0, written: 0, output: 0 }

export const newLedger = (seen: number): Ledger => ({ seen, usd: 0, other: 0, models: {}, steps: {}, subagents: NO_TOKENS })

const addUsage = (bucket: Bucket, u: Usage): Bucket => ({
  fresh: bucket.fresh + (u.input_tokens ?? 0),
  cached: bucket.cached + (u.cache_read_input_tokens ?? 0),
  written: bucket.written + (u.cache_creation_input_tokens ?? 0),
  output: bucket.output + (u.output_tokens ?? 0),
})

const hasTokens = (u: Usage): boolean =>
  (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0) > 0

// What `cost` adds to the last value seen. A lower `cost` is a counter that
// restarted: it becomes the new baseline and credits nothing. `null` is no price at all.
const rise = (ledger: Ledger, cost: number | null): { gain: number; seen: number } =>
  cost === null ? { gain: 0, seen: ledger.seen } : { gain: Math.max(0, cost - ledger.seen), seen: cost }

const addStep = (steps: Record<string, number>, step: string, gain: number): Record<string, number> =>
  gain > 0 ? { ...steps, [step]: (steps[step] ?? 0) + gain } : steps

/**
 * Credits one response: its tokens, and the dollars `cost` rose by since the last
 * credit, to its model and to `step`. A subagent's tokens go to their own bucket.
 */
export const creditResponse = (
  ledger: Ledger,
  r: { cost: number | null; model: string; step: string; usage: Usage; isSubagent: boolean },
): Ledger => {
  const { gain, seen } = rise(ledger, r.cost)
  const key = family(r.model) ?? r.model
  const prev: ModelSpend = ledger.models[key] ?? { ...NO_TOKENS, usd: 0, responses: 0 }
  const counted = r.isSubagent ? prev : addUsage(prev, r.usage)
  const responses = prev.responses + (hasTokens(r.usage) ? 1 : 0)

  return {
    ...ledger,
    seen,
    usd: ledger.usd + gain,
    models: { ...ledger.models, [key]: { ...counted, usd: prev.usd + gain, responses } },
    steps: addStep(ledger.steps, r.step, gain),
    subagents: r.isSubagent ? addUsage(ledger.subagents, r.usage) : ledger.subagents,
  }
}

/** Credits what `cost` rose by outside a response (compaction, background calls) to `other` and to `step`. */
export const creditOther = (ledger: Ledger, cost: number | null, step: string): Ledger => {
  const { gain, seen } = rise(ledger, cost)

  return { ...ledger, seen, usd: ledger.usd + gain, other: ledger.other + gain, steps: addStep(ledger.steps, step, gain) }
}

// Decided from the whole session, not one response: a response can find its cost
// already credited to a parallel one, and a model with any dollars has a price.
export const isUnpriced = (m: ModelSpend): boolean => m.usd === 0 && m.responses > 0

// The share of the spend the switches caused: only when the switch total is kept
// (`showSwitchCost`), a switch was counted and something was spent.
export const spendLine = (ledger: Ledger, switches: SwitchTotal | null): string => {
  const hasUnpriced = Object.values(ledger.models).some(isUnpriced)
  const share =
    switches !== null && switches.count > 0 && ledger.usd > 0
      ? ` · switches ${usd(switches.usd)} (${Math.min(100, Math.round((switches.usd / ledger.usd) * 100))}%)`
      : ''

  return `Spend ${usd(ledger.usd)}${hasUnpriced ? ' + unpriced' : ''}${share}`
}

const isEmpty = (b: Bucket): boolean => b.fresh + b.cached + b.written + b.output === 0

const bucketLine = (b: Bucket): string => `${tokens(b.fresh + b.written)} new · ${tokens(b.cached)} cached · ${tokens(b.output)} out`

// One line per model, dearest first, then subagent tokens and `other`. A model only
// subagents used has its tokens on their line, so its own shows the dollars alone.
export const modelLines = (ledger: Ledger): string[] => {
  const rows: [string, string][] = Object.entries(ledger.models)
    .sort(([, a], [, b]) => b.usd - a.usd)
    .map(([name, m]) => [name, `${isUnpriced(m) ? 'unpriced' : usd(m.usd)}${isEmpty(m) ? '' : ` · ${bucketLine(m)}`}`])
  if (!isEmpty(ledger.subagents)) rows.push(['subagents', bucketLine(ledger.subagents)])
  if (ledger.other > 0) rows.push(['other', usd(ledger.other)])
  const width = Math.max(0, ...rows.map(([name]) => name.length))

  return rows.map(([name, text]) => `${name.padEnd(width)}  ${text}`)
}

export const stepLine = (ledger: Ledger): string | null => {
  const rows = Object.entries(ledger.steps).sort(([, a], [, b]) => b - a)

  return rows.length === 0 ? null : rows.map(([step, n]) => `${step} ${usd(n)}`).join(' · ')
}
