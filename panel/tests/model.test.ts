import { describe, expect, test } from 'claude-code/testing'

import type { CacheUsage, ModelSwitch, SwitchEvent } from '../model'
import {
  NO_SWITCHES,
  addSwitch,
  costLine,
  decide,
  family,
  isMeasurable,
  isStillOurs,
  measureSwitch,
  measuredLine,
  readSetting,
  askPrompt,
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
    expect(addSwitch(NO_SWITCHES, cold)).toEqual({ count: 1, tokens: 0, usd: 0, isGuess: false })
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

  test('the total sums warm switches and is hidden at zero', () => {
    const total = addSwitch(addSwitch(NO_SWITCHES, SWITCH), { ...SWITCH, estimated_cache_write_usd: 1.2604 })

    expect(totalLine(NO_SWITCHES)).toBeNull()
    expect(totalLine(total)).toBe('Switches: 2 · 365k tokens ≈ $2.40')
  })
})
