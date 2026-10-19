import { describe, expect, test } from 'claude-code/testing'

import { emptySnapshot, parseScratchpad } from '../hooks/parse'
import dw2 from './fixtures/dw2'
import dw3 from './fixtures/dw3'
import dw4 from './fixtures/dw4'
import mid from './fixtures/mid'
import tdd from './fixtures/tdd'

describe('parseScratchpad', () => {
  test('reads a finished Regular scratchpad (DW-2)', () => {
    const s = parseScratchpad(dw2)

    expect(s.key).toBe('DW-2')
    expect(s.title).toBe('Agent Plugins compatibility for non-Claude agents')
    expect(s.branch).toBe('feature/DW-2_agent-plugins-compatibility')
    expect(s.mode).toBe('regular')
    expect(s.present).toEqual(['clarify', 'plan', 'implement', 'review', 'release'])
    expect(s.criteria).toEqual({ done: 0, total: 8 })
    expect(s.plan.map(p => p.n)).toEqual([1, 2, 3, 4, 5])
    expect(s.written).toEqual({ done: 5, total: 5, blocked: [] })
  })

  test('a rejected review that later work answers no longer counts', () => {
    expect(parseScratchpad(dw2).verdict).toBeNull()

    const open = '# Issue: x\n## Code Review\n\n**Verdict**: ❌ Request changes\n'
    expect(parseScratchpad(open).verdict).toBe('❌ Request changes')
    expect(parseScratchpad(`${open}\n## Documentation Status\n`).verdict).toBeNull()
    expect(parseScratchpad(`${open}\n## Review Fixes\n`).verdict).toBeNull()
  })

  test('takes the latest of repeated, dated review sections', () => {
    const md = [
      '# Issue: x',
      '## Code Review',
      '**Verdict**: ✅ Approve',
      '## Code Review — 2026-08-26 (re-review)',
      '**Verdict**: ❌ Request changes',
    ].join('\n')

    expect(parseScratchpad(md).verdict).toBe('❌ Request changes')
  })

  test('reads plan steps with title, brief and files (DW-4)', () => {
    const s = parseScratchpad(dw4)
    const [first, third] = [s.plan[0], s.plan[2]]

    expect(s.plan).toHaveLength(8)
    expect(first?.title).toBe('Flip the frontmatter flag')
    expect(first?.brief).toBe('Change `disable-model-invocation: true` to `false`.')
    expect(first?.files).toEqual(['skills/workflow-branch/SKILL.md'])
    // A numbered heading in the text is not the end of the sentence.
    expect(third?.brief.startsWith('Retitle `## 1.')).toBe(true)
    expect(s.criteria.total).toBe(16)
    expect(s.written?.done).toBe(8)
  })

  test('reads another real scratchpad (DW-3)', () => {
    const s = parseScratchpad(dw3)

    expect(s.key).toBe('DW-3')
    expect(s.plan).toHaveLength(7)
    expect(s.present).toEqual(['clarify', 'plan', 'implement', 'release'])
  })

  test('a plan without a status has no written progress (mid-implementation)', () => {
    const s = parseScratchpad(mid)

    expect(s.key).toBe('APP-12')
    expect(s.written).toBeNull()
    expect(s.plan.map(p => p.brief)).toEqual([
      'Register `/settings` in the router.',
      'Create the page component with the form fields.',
      'Add a menu entry.',
    ])
    expect(s.plan[1]?.files).toEqual(['src/pages/Settings.tsx', 'src/pages/Settings.css'])
    expect(s.present).toEqual(['clarify', 'plan'])
  })

  test('reads a TDD scratchpad: cycles, blocked, and Cycles completed', () => {
    const s = parseScratchpad(tdd)

    expect(s.mode).toBe('tdd')
    expect(s.present).toEqual(['clarify', 'plan', 'test-red', 'implement-green'])
    expect(s.criteria).toEqual({ done: 1, total: 3 })
    expect(s.plan.map(p => p.title)).toEqual(['Retries on 503', 'Waits with backoff', 'Gives up after five'])
    expect(s.plan[0]?.brief).toBe('Loop up to 3 times when the status is 503.')
    expect(s.plan[1]?.brief).toBe('Sleep 2^n seconds between attempts.')
    expect(s.plan[1]?.files).toEqual(['src/client.ts', 'src/sleep.ts'])
    expect(s.written).toEqual({ done: 2, total: 3, blocked: [3] })
  })

  test('ignores headings inside fenced code', () => {
    const md = '# Issue: x\n\n```markdown\n## Release\n### Step 1: fake\n```\n'
    const s = parseScratchpad(md)

    expect(s.present).toEqual(['clarify'])
    expect(s.plan).toEqual([])
  })

  test('does not match a longer heading that merely starts the same way', () => {
    expect(parseScratchpad('# Issue: x\n## Releases\n').present).toEqual(['clarify'])
  })

  test("lists the latest review's findings, settled by a later Review Fixes section (DW-2)", () => {
    const f = parseScratchpad(dw2).findings

    expect(f.map(x => x.id)).toEqual(['C1', 'C2', 'C3', 'W1', 'W2', 'S1', 'S2'])
    expect(f.filter(x => x.state === 'fixed').map(x => x.id)).toEqual(['C1', 'C2', 'C3', 'W1'])
    // its fixes say "[W2] Still declined, still standing"
    expect(f.find(x => x.id === 'W2')?.state).toBe('declined')
    expect(f.find(x => x.id === 'S1')?.state).toBe('open')
  })

  test('reads fixed, declined and open findings, and trims the title at its file', () => {
    const md = [
      '# Issue: x',
      '## Code Review',
      '**Verdict**: ⚠️ Approve with comments',
      '### Findings requiring action',
      '- [W1] Leaks edits — `hooks/register.tsx`',
      '- [W2] Idle churn — `hooks/register.tsx`',
      '### Suggestions',
      '- [S1] Rename the thing.',
      '- [S2] Size by rows — `a.ts`',
      '- [S3] Never mentioned again',
      '## Review Fixes',
      '**Addressed**: W1, S2 — W2 declined',
      '**Declined**: S1',
    ].join('\n')
    const f = parseScratchpad(md).findings

    expect(f.map(x => `${x.id}:${x.state}`)).toEqual([
      'W1:fixed', 'W2:declined', 'S1:declined', 'S2:fixed', 'S3:open',
    ])
    expect(f[0]?.title).toBe('Leaks edits')
    expect(f[2]?.title).toBe('Rename the thing')
  })

  test('a finding named only outside a Review Fixes section stays open', () => {
    const md = '# Issue: x\n## Code Review\n- [W1] Thing — `a.ts`\n## Test Status\nW1 covered by tests\n'

    expect(parseScratchpad(md).findings[0]?.state).toBe('open')
  })

  test('falls back to empty values and never throws on odd input', () => {
    expect(parseScratchpad('')).toEqual(emptySnapshot())
    expect(parseScratchpad('no headings at all')).toEqual(emptySnapshot())
    for (const cut of [0, 1, 17, 200, 999, dw2.length - 3]) {
      expect(() => parseScratchpad(dw2.slice(0, cut))).not.toThrow()
    }
    expect(() => parseScratchpad('# Issue:\n\n## Implementation Status\n**Steps completed**: x of y')).not.toThrow()
  })

  test('takes the key from Source, then the title, then the branch', () => {
    expect(parseScratchpad('# Issue: Fix AB-9 crash\n**Source**: manual\n').key).toBe('AB-9')
    expect(parseScratchpad('# Issue: none\n**Source**: manual\n**Branch**: fix/QA-31_thing\n').key).toBe('QA-31')
    expect(parseScratchpad('# Issue: none\n**Source**: tasks/DW-5_x.md\n').key).toBe('DW-5')
  })
})
