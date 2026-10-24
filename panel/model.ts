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

export type SwitchTotal = { count: number; tokens: number; usd: number; isGuess: boolean }

export const MODEL_SWITCH_VALUES: readonly ModelSwitch[] = ['off', 'suggest', 'upgrade', 'multi-turn', 'always']

export const NO_SWITCHES: SwitchTotal = { count: 0, tokens: 0, usd: 0, isGuess: false }

const RANK: Record<Family, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }

export const readSetting = (value: unknown): ModelSwitch =>
  MODEL_SWITCH_VALUES.find(v => v === value) ?? 'off'

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

const tokens = (n: number): string => (n < 1000 ? String(n) : `${Math.round(n / 1000)}k`)

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

export const addSwitch = (total: SwitchTotal, e: SwitchEvent): SwitchTotal =>
  e.context_tokens === 0
    ? total
    : {
        count: total.count + 1,
        tokens: total.tokens + (e.prompt_cache_warm ? e.context_tokens : 0),
        usd: total.usd + (e.prompt_cache_warm ? e.estimated_cache_write_usd : 0),
        isGuess: total.isGuess || (e.prompt_cache_warm && e.pricing === 'default'),
      }

export const totalLine = (total: SwitchTotal): string | null =>
  total.count === 0
    ? null
    : `Switches: ${total.count} · ${total.tokens > 0 ? `${tokens(total.tokens)} tokens ` : ''}≈ ${usd(total.usd)}${
        total.isGuess ? ' (rough guess)' : ''
      }`
