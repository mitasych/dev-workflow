import { describe, expect, test } from 'claude-code/testing'

import type { CacheUsage, Ledger, ModelSwitch, SwitchEvent, Usage } from '../model'
import {
  NO_SWITCHES,
  addSwitch,
  costLine,
  creditOther,
  creditResponse,
  decide,
  isUnpriced,
  family,
  guessSwitch,
  isMeasurable,
  isStillOurs,
  measureSwitch,
  measuredLine,
  modelLines,
  newLedger,
  readSetting,
  readSpendReport,
  askPrompt,
  skipSwitch,
  spendLine,
  stepLine,
  switchToast,
  totalLine,
} from '../model'

const SWITCH: SwitchEvent = {
  from_model: 'claude-sonnet-5-5',
  to_model: 'claude-opus-5-5',
  context_tokens: 182340,
  prompt_cache_warm: true,
  estimated_cache_write_usd: 1.1396,
  pricing: 'catalog',
}

const run = (setting: ModelSwitch, skillModel: unknown, sessionModel: string, isMultiTurn = false) =>
  decide({ setting, skillModel, sessionModel, isMultiTurn })

describe('family', () => {
  test('reads aliases, full ids and display names', () => {
    expect(family('opus')).toBe('opus')
    expect(family('opus[1m]')).toBe('opus')
    expect(family('claude-sonnet-5-5')).toBe('sonnet')
    expect(family('Haiku 5.5')).toBe('haiku')
    expect(family('claude-fable-5-1')).toBe('fable')
    expect(family('best')).toBe('fable')
  })

  test('anything else is no family', () => {
    expect(family('opusplan')).toBeNull()
    expect(family('default')).toBeNull()
    expect(family('inherit')).toBeNull()
    expect(family('gpt-5')).toBeNull()
  })
})

describe('readSetting', () => {
  test('keeps a listed value and reads anything else as off', () => {
    expect(readSetting('upgrade')).toBe('upgrade')
    expect(readSetting('multi-turn')).toBe('multi-turn')
    expect(readSetting(undefined)).toBe('off')
    expect(readSetting('sometimes')).toBe('off')
    expect(readSetting(true)).toBe('off')
  })
})

describe('decide', () => {
  test('off never acts', () => {
    expect(run('off', 'opus', 'claude-sonnet-5-5')).toEqual({ kind: 'none' })
  })

  test('inherit, a missing model, an unknown family or the same family never acts', () => {
    for (const setting of ['suggest', 'upgrade', 'multi-turn', 'always'] as const) {
      expect(run(setting, 'inherit', 'claude-sonnet-5-5', true)).toEqual({ kind: 'none' })
      expect(run(setting, undefined, 'claude-sonnet-5-5', true)).toEqual({ kind: 'none' })
      expect(run(setting, 'opus', 'mystery-model', true)).toEqual({ kind: 'none' })
      expect(run(setting, 'opus', 'claude-opus-5-5', true)).toEqual({ kind: 'none' })
    }
  })

  test('suggest names the model and never switches', () => {
    expect(run('suggest', 'opus', 'claude-sonnet-5-5')).toEqual({ kind: 'suggest', model: 'opus' })
    expect(run('suggest', 'haiku', 'claude-opus-5-5')).toEqual({ kind: 'suggest', model: 'haiku' })
  })

  test('upgrade switches up and never down', () => {
    expect(run('upgrade', 'opus', 'claude-sonnet-5-5')).toEqual({ kind: 'switch', model: 'opus' })
    expect(run('upgrade', 'sonnet', 'claude-haiku-5-5')).toEqual({ kind: 'switch', model: 'sonnet' })
    expect(run('upgrade', 'haiku', 'claude-opus-5-5')).toEqual({ kind: 'none' })
    expect(run('upgrade', 'opus', 'claude-fable-5-1')).toEqual({ kind: 'none' })
  })

  test('multi-turn switches either way, for flagged skills only', () => {
    expect(run('multi-turn', 'opus', 'claude-sonnet-5-5', true)).toEqual({ kind: 'switch', model: 'opus' })
    expect(run('multi-turn', 'sonnet', 'claude-opus-5-5', true)).toEqual({ kind: 'switch', model: 'sonnet' })
    expect(run('multi-turn', 'opus', 'claude-sonnet-5-5', false)).toEqual({ kind: 'none' })
  })

  test('always follows the skill either way', () => {
    expect(run('always', 'haiku', 'claude-opus-5-5')).toEqual({ kind: 'switch', model: 'haiku' })
    expect(run('always', 'opus', 'claude-sonnet-5-5')).toEqual({ kind: 'switch', model: 'opus' })
  })
})

describe('isStillOurs', () => {
  test('compares families, so an alias matches its full id, but not another variant', () => {
    expect(isStillOurs('claude-opus-5-5', 'opus')).toBe(true)
    expect(isStillOurs('sonnet', 'opus')).toBe(false)
    expect(isStillOurs('default', 'default')).toBe(true)
    expect(isStillOurs('opus[1m]', 'opus')).toBe(false)
    expect(isStillOurs('claude-opus-5-5[1m]', 'opus[1m]')).toBe(true)
  })
})

describe('toasts', () => {
  test('name the command without its plugin prefix', () => {
    expect(switchToast('dev-workflow:workflow-plan', 'opus')).toBe('Model → opus for /workflow-plan')
    expect(askPrompt('learn-code', 'opus', 'claude-sonnet-5-5')).toEqual({
      question: '/learn-code runs on opus. Switch this session to opus too? It is on sonnet.',
      header: 'Model',
      switch: 'Switch to opus',
      stay: 'Stay on sonnet',
    })
  })
})

describe('cost report', () => {
  test('a warm switch reports the tokens and the estimate', () => {
    expect(costLine(SWITCH)).toBe('sonnet → opus · re-cache up to 182,340 tokens ≈ $1.14 — measuring…')
  })

  test('a cold cache loses nothing and adds nothing to the total', () => {
    const cold = { ...SWITCH, prompt_cache_warm: false }

    expect(costLine(cold)).toBe('sonnet → opus · cache already cold, nothing lost')
    expect(addSwitch(NO_SWITCHES, cold)).toEqual({ count: 1, tokens: 0, usd: 0, guesses: 0 })
  })

  test('a default price is marked as a rough guess, in the toast and the total', () => {
    const guess = { ...SWITCH, pricing: 'default' }

    expect(costLine(guess)).toBe('sonnet → opus · re-cache up to 182,340 tokens ≈ $1.14 (rough guess) — measuring…')
    expect(totalLine(addSwitch(NO_SWITCHES, guess))).toBe('Switches: 1 · 182k tokens ≈ $1.14 (rough guess)')
  })

  test('a lead replaces the from → to head, and a cold cache keeps it', () => {
    expect(costLine(SWITCH, 'Model → opus for /workflow-plan')).toBe(
      'Model → opus for /workflow-plan · re-cache up to 182,340 tokens ≈ $1.14 — measuring…',
    )
    expect(costLine({ ...SWITCH, prompt_cache_warm: false }, 'Model → opus for /workflow-plan')).toBe(
      'Model → opus for /workflow-plan · cache already cold, nothing lost',
    )
  })

  test('a model with no live cache re-writes about what the estimate says', () => {
    const cold: CacheUsage = { model: 'claude-opus-5-5', cache_read_input_tokens: 600, cache_creation_input_tokens: 182340 }

    expect(measuredLine(SWITCH, cold)).toBe('sonnet → opus · re-cached 182,340 of 182,940 tokens ≈ $1.14 (measured)')
  })

  test('a model whose cache is still warm re-writes only what was added', () => {
    const warm: CacheUsage = { model: 'claude-opus-5-5', cache_read_input_tokens: 322131, cache_creation_input_tokens: 821 }

    expect(measuredLine(SWITCH, warm, 'Model → opus for /workflow-plan')).toBe(
      'Model → opus for /workflow-plan · re-cached 821 of 322,952 tokens ≈ <$0.01 (measured)',
    )
    expect(totalLine(measureSwitch(addSwitch(NO_SWITCHES, SWITCH), SWITCH, warm))).toBe('Switches: 1 · 821 tokens ≈ <$0.01')
  })

  test('only the first request on the model the switch named is measured, and only after a warm cache', () => {
    const usage: CacheUsage = { model: 'claude-opus-5-5', cache_read_input_tokens: 1, cache_creation_input_tokens: 1 }

    expect(isMeasurable(SWITCH, usage)).toBe(true)
    expect(isMeasurable(SWITCH, { ...usage, model: 'claude-sonnet-5-5' })).toBe(false)
    expect(isMeasurable({ ...SWITCH, prompt_cache_warm: false }, usage)).toBe(false)
    expect(isMeasurable({ ...SWITCH, context_tokens: 0 }, usage)).toBe(false)
  })

  test('a switch before the first response is neither shown nor counted', () => {
    const empty = { ...SWITCH, context_tokens: 0 }

    expect(costLine(empty)).toBeNull()
    expect(addSwitch(NO_SWITCHES, empty)).toBe(NO_SWITCHES)
  })

  test('a switch overtaken before any request comes off the total but stays counted', () => {
    const two = addSwitch(addSwitch(NO_SWITCHES, SWITCH), { ...SWITCH, estimated_cache_write_usd: 1.2604 })

    expect(totalLine(skipSwitch(two, SWITCH))).toBe('Switches: 2 · 182k tokens ≈ $1.26')
    expect(skipSwitch(addSwitch(NO_SWITCHES, SWITCH), SWITCH)).toEqual({ count: 1, tokens: 0, usd: 0, guesses: 0 })
  })

  test('a guessed estimate that comes off the total takes its rough-guess mark with it', () => {
    const unpriced = { ...SWITCH, pricing: 'default' }
    const both = addSwitch(addSwitch(NO_SWITCHES, unpriced), SWITCH)

    expect(totalLine(skipSwitch(addSwitch(NO_SWITCHES, unpriced), unpriced))).toBe('Switches: 1 · ≈ $0.00')
    expect(totalLine(skipSwitch(both, SWITCH))).toBe('Switches: 2 · 182k tokens ≈ $1.14 (rough guess)')
  })

  test('a switch left unmeasured is a guess, counted once even if its price already was one', () => {
    const unpriced = { ...SWITCH, pricing: 'default' }

    expect(guessSwitch(addSwitch(NO_SWITCHES, SWITCH), SWITCH).guesses).toBe(1)
    expect(guessSwitch(addSwitch(NO_SWITCHES, unpriced), unpriced).guesses).toBe(1)
  })

  test('the total sums warm switches and is hidden at zero', () => {
    const total = addSwitch(addSwitch(NO_SWITCHES, SWITCH), { ...SWITCH, estimated_cache_write_usd: 1.2604 })

    expect(totalLine(NO_SWITCHES)).toBeNull()
    expect(totalLine(total)).toBe('Switches: 2 · 365k tokens ≈ $2.40')
  })
})

const usage = (fresh: number, cached: number, written: number, output: number): Usage => ({
  input_tokens: fresh,
  cache_read_input_tokens: cached,
  cache_creation_input_tokens: written,
  output_tokens: output,
})

const near = (a: number | undefined, b: number): void => expect(Math.abs((a ?? NaN) - b) < 1e-9).toBe(true)

const response = (
  ledger: Ledger,
  cost: number | null,
  model: string,
  step: string,
  u: Usage,
  isSubagent = false,
): Ledger => creditResponse(ledger, { cost, model, step, usage: u, isSubagent })

describe('readSpendReport', () => {
  test('keeps a listed value and reads anything else as off', () => {
    expect(readSpendReport('step')).toBe('step')
    expect(readSpendReport('model')).toBe('model')
    expect(readSpendReport(undefined)).toBe('off')
    expect(readSpendReport('everything')).toBe('off')
    expect(readSpendReport(1)).toBe('off')
  })
})

describe('spend ledger', () => {
  // A resumed session: $52.04 was already spent when the ledger started.
  const start = newLedger(52.04)

  test('credits each response what the cost rose by, to its model and step', () => {
    let l = response(start, 52.14, 'claude-sonnet-5-5', 'plan', usage(2, 1000, 300, 400))
    l = response(l, 52.64, 'claude-opus-5-5', 'plan', usage(2, 0, 5000, 100))
    l = response(l, 52.74, 'claude-opus-5-5', 'implement', usage(2, 5000, 100, 100))

    near(l.usd, 0.7)
    near(l.seen, 52.74)
    near(l.models.sonnet?.usd, 0.1)
    near(l.models.opus?.usd, 0.6)
    near(l.steps.plan, 0.6)
    near(l.steps.implement, 0.1)
    expect(l.models.opus).toMatchObject({ fresh: 4, cached: 5000, written: 5100, output: 200 })
  })

  test('the credits add up to what the cost rose by', () => {
    let l = start
    for (const cost of [52.1, 52.35, 52.36, 52.9]) l = response(l, cost, 'claude-sonnet-5-5', 'none', usage(1, 1, 1, 1))
    l = creditOther(l, 53.2, 'none')

    near(l.usd, 53.2 - 52.04)
    near(Object.values(l.models).reduce((n, m) => n + m.usd, 0) + l.other, l.usd)
    near(Object.values(l.steps).reduce((n, v) => n + v, 0), l.usd)
  })

  test("a subagent's tokens go to their own bucket and its dollars to its model", () => {
    const l = response(start, 52.05, 'claude-haiku-5-5', 'plan', usage(2, 0, 41883, 4), true)

    expect(l.subagents).toEqual({ fresh: 2, cached: 0, written: 41883, output: 4 })
    expect(l.models.haiku).toMatchObject({ fresh: 0, cached: 0, written: 0, output: 0 })
    near(l.models.haiku?.usd, 0.01)
  })

  test('spend outside a response goes to other, not to the next response', () => {
    let l = creditOther(start, 52.17, 'plan')
    l = response(l, 52.2, 'claude-sonnet-5-5', 'plan', usage(2, 0, 100, 10))

    near(l.other, 0.13)
    near(l.models.sonnet?.usd, 0.03)
    near(l.steps.plan, 0.16)
  })

  test('a lower cost is a counter that restarted: a new baseline, no credit, not unpriced', () => {
    const l = response(response(start, 52.14, 'claude-sonnet-5-5', 'none', usage(1, 1, 1, 1)), 0.2, 'claude-sonnet-5-5', 'none', usage(1, 1, 1, 1))

    expect(l.seen).toBe(0.2)
    near(l.usd, 0.1)
    expect(isUnpriced(l.models.sonnet!)).toBe(false)
    near(creditOther(l, 0.1, 'none').usd, 0.1)
  })

  test('a model whose responses all cost nothing is unpriced, and so is one with no price at all', () => {
    const none = response(start, 52.04, 'mystery-model', 'none', usage(0, 0, 900, 10))
    const noPrice = response(start, null, 'claude-opus-5-5', 'none', usage(0, 0, 900, 10))
    const subagentOnly = response(start, 52.04, 'mystery-model', 'none', usage(0, 0, 900, 10), true)

    expect(isUnpriced(none.models['mystery-model']!)).toBe(true)
    expect(isUnpriced(noPrice.models.opus!)).toBe(true)
    expect(isUnpriced(subagentOnly.models['mystery-model']!)).toBe(true)
    expect(noPrice.seen).toBe(52.04)
    expect(isUnpriced(response(start, 52.04, 'claude-opus-5-5', 'none', usage(0, 0, 0, 0)).models.opus!)).toBe(false)
  })

  test('a response whose cost a parallel one already took keeps its model priced', () => {
    // The sonnet response read a cost that already held the haiku subagent's.
    let l = response(start, 52.5, 'claude-sonnet-5-5', 'plan', usage(2, 900, 100, 10))
    l = response(l, 52.5, 'claude-haiku-5-5', 'plan', usage(2, 0, 900, 10), true)
    l = response(l, 52.6, 'claude-haiku-5-5', 'plan', usage(2, 0, 900, 10), true)

    expect(isUnpriced(l.models.haiku!)).toBe(false)
    near(l.models.haiku?.usd, 0.1)
  })

  test('a family keeps one row across aliases and ids', () => {
    const l = response(response(start, 52.1, 'claude-sonnet-5-5', 'none', usage(1, 0, 0, 1)), 52.2, 'sonnet', 'none', usage(1, 0, 0, 1))

    expect(Object.keys(l.models)).toEqual(['sonnet'])
  })
})

describe('spend lines', () => {
  const base = newLedger(0)
  let l = response(base, 4.1, 'claude-opus-5-5', 'plan', usage(40, 1_200_000, 38_000, 4000))
  l = response(l, 5.51, 'claude-sonnet-5-5', 'implement', usage(10, 80_000, 2000, 900))
  l = response(l, 5.53, 'claude-haiku-5-5', 'implement', usage(2, 0, 12_000, 2000), true)
  l = creditOther(l, 5.65, 'implement')

  test('total: the spend, and the share the switches caused when they are counted', () => {
    expect(spendLine(l, null)).toBe('Spend $5.65')
    expect(spendLine(l, NO_SWITCHES)).toBe('Spend $5.65')
    expect(spendLine(l, { count: 2, tokens: 0, usd: 0.94, guesses: 0 })).toBe('Spend $5.65 · switches $0.94 (17%)')
    expect(spendLine(newLedger(1), { count: 1, tokens: 1, usd: 0.5, guesses: 0 })).toBe('Spend $0.00')
    expect(spendLine(l, { count: 1, tokens: 1, usd: 9, guesses: 0 })).toBe('Spend $5.65 · switches $9.00 (100%)')
  })

  test('total: an unpriced model is marked', () => {
    expect(spendLine(response(base, 0, 'mystery', 'none', usage(1, 0, 0, 1)), null)).toBe('Spend $0.00 + unpriced')
  })

  test('model: one line per model, dearest first, then subagents and other', () => {
    expect(modelLines(l)).toEqual([
      'opus       $4.10 · 38k new · 1.2M cached · 4k out',
      'sonnet     $1.41 · 2k new · 80k cached · 900 out',
      'haiku      $0.02',
      'subagents  12k new · 0 cached · 2k out',
      'other      $0.12',
    ])
  })

  test('model: an unpriced model reads unpriced, and a quiet ledger has no lines', () => {
    expect(modelLines(response(base, 0, 'mystery', 'none', usage(1, 0, 0, 1)))).toEqual(['mystery  unpriced · 1 new · 0 cached · 1 out'])
    expect(modelLines(base)).toEqual([])
  })

  test('step: dearest first, none for spend before the first step', () => {
    const early = creditOther(newLedger(0), 0.2, 'none')

    expect(stepLine(l)).toBe('plan $4.10 · implement $1.55')
    expect(stepLine(early)).toBe('none $0.20')
    expect(stepLine(base)).toBeNull()
  })

  test('a realistic block fits 56 columns, with the step line left to wrap', () => {
    for (const line of [spendLine(l, { count: 2, tokens: 0, usd: 0.94, guesses: 0 }), ...modelLines(l)]) {
      expect(line.length).toBeLessThanOrEqual(56)
    }
    expect(stepLine(l)?.length).toBeLessThanOrEqual(56)
  })

  test('the widest realistic rows still fit: four digits of dollars, millions of tokens', () => {
    const big = response(newLedger(0), 1234.56, 'claude-sonnet-5-5', 'implement', usage(900, 12_300_000, 4_000_000, 250_000))

    expect(modelLines(big)[0]).toBe('sonnet  $1234.56 · 4.0M new · 12.3M cached · 250k out')
    for (const line of modelLines(big)) expect(line.length).toBeLessThanOrEqual(56)
  })
})
