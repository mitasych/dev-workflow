import { describe, expect, test } from 'claude-code/testing'

import { parseScratchpad } from '../parse'
import { deriveView } from '../view'
import dw2 from './fixtures/dw2'
import mid from './fixtures/mid'
import tdd from './fixtures/tdd'

const icons = (v: ReturnType<typeof deriveView>) => v.steps.map(s => `${s.icon} ${s.id}`)

describe('deriveView', () => {
  test('Regular mode lists the Regular path only', () => {
    const v = deriveView(parseScratchpad(mid), [], null)

    expect(v.steps.map(s => s.id)).toEqual(['clarify', 'plan', 'implement', 'test', 'review', 'document', 'release'])
  })

  test('TDD mode lists the TDD path only', () => {
    const v = deriveView(parseScratchpad(tdd), [], null)

    expect(v.steps.map(s => s.id)).toEqual([
      'clarify', 'plan', 'test-red', 'implement-green', 'refactor', 'review', 'document', 'release',
    ])
    expect(v.planNoun).toBe('cycles')
  })

  test('an unplanned issue shows both paths', () => {
    const v = deriveView(parseScratchpad('# Issue: x\n**Source**: AB-1\n'), [], null)
    const ids = v.steps.map(s => s.id)

    expect(ids).toContain('implement')
    expect(ids).toContain('implement-green')
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('marks written sections done, the active skill in progress, the rest pending', () => {
    const v = deriveView(parseScratchpad(mid), [], 'implement')

    expect(icons(v).slice(0, 4)).toEqual(['✅ clarify', '✅ plan', '🔄 implement', '⬜ test'])
    expect(v.steps[1]?.detail).toBe('3 steps')
    expect(v.next).toBe('/workflow-test')
  })

  test('an active skill whose section already exists stays done', () => {
    const v = deriveView(parseScratchpad(dw2), [], 'plan')

    expect(v.steps.find(s => s.id === 'plan')?.icon).toBe('✅')
  })

  test('infers plan progress from edited files, flagged as guesses', () => {
    const v = deriveView(parseScratchpad(mid), ['src/router.ts', 'src/pages/Settings.tsx'], 'implement')

    expect(v.plan.map(r => `${r.icon}${r.inferred ? '~' : ''}`)).toEqual(['✅~', '🔄~', '⬜'])
    expect([v.currentId, v.progress]).toEqual(['implement', ' ~1/3'])
  })

  test('written progress overrides inference', () => {
    const md = `${mid}\n## Implementation Status\n\n**Steps completed**: 1 of 3\n**Blocked steps**: 2\n`
    const v = deriveView(parseScratchpad(md), ['src/Menu.tsx'], null)

    expect(v.plan.map(r => `${r.icon}${r.inferred ? '~' : ''}`)).toEqual(['✅', '❌', '⬜'])
  })

  test('digits in a blocked-step note do not block other steps', () => {
    const md = `${mid}\n## Implementation Status\n\n**Steps completed**: 1 of 3\n**Blocked steps**: 2 (waiting on k3d since 2026-10-23)\n`
    const v = deriveView(parseScratchpad(md), [], null)

    expect(v.plan.map(r => r.icon)).toEqual(['✅', '❌', '⬜'])
  })

  test('a blocked step with a dated note leaves the rest of a 14-step plan unshifted', () => {
    const steps = Array.from({ length: 14 }, (_, i) => `### Step ${i + 1}: s${i + 1}\n- **Action**: Do ${i + 1}.\n- **Files**: \`src/f${i + 1}.ts\` — modify\n`)
    const status = '**Steps completed**: 10 of 14\n**Blocked steps**: 10 (k3d functional check — Maxwell silent since 2026-10-23)\n'
    const md = `# Issue: x\n\n## Implementation Plan\n\n**Mode**: Regular\n\n${steps.join('\n')}\n## Implementation Status\n\n${status}`
    const v = deriveView(parseScratchpad(md), [], null)

    expect(v.plan.map(r => r.icon)).toEqual([...Array(9).fill('✅'), '❌', '✅', '⬜', '⬜', '⬜'])
  })

  test('a leading ./ on a file does not hide an edit', () => {
    const md = mid.replace('`src/router.ts`', '`./src/router.ts`')
    const v = deriveView(parseScratchpad(md), ['src/router.ts'], null)

    expect(v.plan[0]?.icon).toBe('✅')
  })

  test('confirmed TDD progress counts cycles', () => {
    const v = deriveView(parseScratchpad(tdd), [], null)

    expect(v.plan.map(r => r.icon)).toEqual(['✅', '✅', '❌'])
    expect(v.steps.find(s => s.id === 'implement-green')?.detail).toBe('2/3')
  })

  test('an unanswered rejection marks Review ❌ and says what to do', () => {
    const md = `${mid}\n## Code Review\n\n**Verdict**: ❌ Request changes\n`
    const v = deriveView(parseScratchpad(md), [], null)

    expect(v.steps.find(s => s.id === 'review')?.icon).toBe('❌')
    expect(v.next).toContain('re-run /workflow-review')
  })

  test('a release closes the issue even with skipped steps', () => {
    const v = deriveView(parseScratchpad(dw2), [], null)

    expect(v.steps.find(s => s.id === 'test')?.icon).toBe('⬜')
    expect(v.criteria.total).toBe(8)
    expect(v.criteria.counts.open).toBe(8)
    expect(v.currentId).toBeNull()
    expect(v.next).toBeNull()
  })

  test('the current step is the first pending one, with plan progress while building', () => {
    const v = deriveView(parseScratchpad(mid), [], null)

    expect([v.currentId, v.progress]).toEqual(['implement', ' 0/3'])
  })

  test('lists the criteria not met, worst first and in scratchpad order within a state', () => {
    const md = [
      '# Issue: x',
      '## Acceptance Criteria',
      '- [ ] open one',
      '- [x] met one',
      '- [?] unverified one',
      '- [!] failed one',
      '- [~] partly one',
      '- [!] failed two',
      '',
    ].join('\n')
    const v = deriveView(parseScratchpad(md), [], null)

    expect(v.criteria.total).toBe(6)
    expect(v.criteria.counts).toEqual({ open: 1, met: 1, unverified: 1, failed: 2, partly: 1 })
    expect(v.criteria.pending.map(c => c.text)).toEqual([
      'failed one',
      'failed two',
      'partly one',
      'unverified one',
      'open one',
    ])
  })

  test('nothing is pending once every criterion is met, and a pre-marker snapshot is empty', () => {
    const done = deriveView(parseScratchpad('# Issue: x\n## Acceptance Criteria\n- [x] a\n- [x] b\n'), [], null)

    expect(done.criteria.pending).toEqual([])
    expect(done.criteria.counts.met).toBe(2)

    const old = { ...parseScratchpad(mid), criteria: { done: 1, total: 3 } } as unknown as Parameters<typeof deriveView>[0]

    expect(deriveView(old, [], null).criteria.total).toBe(0)
  })
})
