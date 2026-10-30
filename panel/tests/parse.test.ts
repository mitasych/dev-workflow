import { describe, expect, test } from 'claude-code/testing'

import { emptySnapshot, parseScratchpad } from '../parse'
import dw2 from './fixtures/dw2'
import dw3 from './fixtures/dw3'
import dw4 from './fixtures/dw4'
import mid from './fixtures/mid'
import tdd from './fixtures/tdd'

const blocked = (value: string) =>
  parseScratchpad(`# Issue: x\n## Implementation Status\n\n**Steps completed**: 1 of 14\n**Blocked steps**: ${value}\n`)
    .written?.blocked

describe('parseScratchpad', () => {
  test('reads a finished Regular scratchpad (DW-2)', () => {
    const s = parseScratchpad(dw2)

    expect(s.key).toBe('DW-2')
    expect(s.title).toBe('Agent Plugins compatibility for non-Claude agents')
    expect(s.branch).toBe('feature/DW-2_agent-plugins-compatibility')
    expect(s.mode).toBe('regular')
    expect(s.present).toEqual(['clarify', 'plan', 'implement', 'review', 'release'])
    expect(s.criteria).toHaveLength(8)
    expect(s.criteria.every(c => c.state === 'open')).toBe(true)
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
    expect(s.criteria).toHaveLength(16)
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
    expect(s.criteria).toHaveLength(3)
    expect(s.criteria.filter(c => c.state === 'met')).toHaveLength(1)
    expect(s.plan.map(p => p.title)).toEqual(['Retries on 503', 'Waits with backoff', 'Gives up after five'])
    expect(s.plan[0]?.brief).toBe('Loop up to 3 times when the status is 503.')
    expect(s.plan[1]?.brief).toBe('Sleep 2^n seconds between attempts.')
    expect(s.plan[1]?.files).toEqual(['src/client.ts', 'src/sleep.ts'])
    expect(s.written).toEqual({ done: 2, total: 3, blocked: [3] })
  })

  test('Blocked steps reads only the leading list; a note after it is ignored', () => {
    expect(blocked('10 (k3d functional check — Maxwell silent since 2026-10-23)')).toEqual([10])
    expect(blocked('3, 5')).toEqual([3, 5])
    expect(blocked('3,5')).toEqual([3, 5])
    expect(blocked('Steps 3 and 5')).toEqual([3, 5])
    expect(blocked('step 3 & 5')).toEqual([3, 5])
    expect(blocked('#3')).toEqual([3])
    expect(blocked('3 5')).toEqual([3])
    expect(blocked('3, 5 — 5 waits on step 2')).toEqual([3, 5])
    expect(blocked('none')).toEqual([])
    expect(blocked('None — all done')).toEqual([])
    expect(blocked('none (Step 5 was run afterwards)')).toEqual([])
    expect(blocked('waiting on k3d')).toEqual([])
    expect(blocked('STEPS 3')).toEqual([3])
    expect(blocked('Cycle 3')).toEqual([3])
  })

  test('Blocked steps accepts an Oxford comma, a repeated word, and a colon after step or cycle', () => {
    expect(blocked('Steps 3, 5, and 7')).toEqual([3, 5, 7])
    expect(blocked('step 3, step 5')).toEqual([3, 5])
    expect(blocked('Steps: 3')).toEqual([3])
    expect(blocked('Steps 3 and step 5')).toEqual([3, 5])
    expect(blocked('3, and 5')).toEqual([3, 5])
    expect(blocked('3,5, and 7')).toEqual([3, 5, 7])
    expect(blocked('Cycles: 2, 4')).toEqual([2, 4])
  })

  test('Blocked steps stops at a dangling separator or a word that only starts with "and"', () => {
    expect(blocked('3, and')).toEqual([3])
    expect(blocked('3, step')).toEqual([3])
    expect(blocked('3, waiting on k3d')).toEqual([3])
    expect(blocked('3 andromeda 5')).toEqual([3])
  })

  // A backtracking regex takes seconds here (~3 s cubic at 3000); a linear one well under 1 ms.
  test('Blocked steps does not stall on a long run of spaces after the word', () => {
    const start = performance.now()
    const value = blocked(`step${' '.repeat(3000)}x`)

    expect(value).toEqual([])
    expect(performance.now() - start).toBeLessThan(500)
  })

  test('Blocked steps values already in archived scratchpads keep their meaning', () => {
    const live = '7 (live look at the panel: automated checks pass, the sidebar and colors are not yet seen in a real session)'
    const later = 'none (step 8 marked done by the user after a live check: `/workflow-panel` opens the band — see Issues)'

    expect(blocked(live)).toEqual([7])
    expect(blocked(later)).toEqual([])
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

  test('reads the five checkbox markers, and counts an unknown one as open', () => {
    const md = [
      '# Issue: x',
      '## Acceptance Criteria',
      '- [ ] Given a, Then open',
      '- [x] Given b, Then met',
      '- [X] Given c, Then **met** too',
      '- [?] Given d, Then unverified',
      '- [!] Given e, Then failed',
      '- [~] Given f, Then   partly',
      '- [-] Given g, Then unknown marker',
      '- [link](https://example.com) is no box',
      '- plain bullet, no box',
      '',
    ].join('\n')
    const c = parseScratchpad(md).criteria

    expect(c.map(x => x.state)).toEqual(['open', 'met', 'met', 'unverified', 'failed', 'partly', 'open'])
    expect(c[2]?.text).toBe('Given c, Then met too')
    expect(c[5]?.text).toBe('Given f, Then partly')
  })

  test('a two-letter tag or a link is no checkbox, and spaces around the marker are fine', () => {
    const md = [
      '# Issue: x',
      '## Acceptance Criteria',
      '- [UI] Given a tag, Then no box',
      '- [P1] Given a priority, Then no box',
      '- [X ] Given a spaced marker, Then met',
      '- [] Given an empty box, Then open',
      '',
    ].join('\n')

    expect(parseScratchpad(md).criteria).toEqual([
      { text: 'Given a spaced marker, Then met', state: 'met' },
      { text: 'Given an empty box, Then open', state: 'open' },
    ])
  })

  test('criteria come from the latest Acceptance Criteria section only', () => {
    const md = '# Issue: x\n## Acceptance Criteria\n- [ ] old\n## Plan\n## Acceptance Criteria\n- [x] new\n'

    expect(parseScratchpad(md).criteria).toEqual([{ text: 'new', state: 'met' }])
    expect(parseScratchpad('# Issue: x\n- [x] outside any section\n').criteria).toEqual([])
  })

  test('the criteria totals of the archived scratchpads match the two-state parser they replaced', () => {
    // [met, total] counted with the old `[ xX]`-only reader
    const was = { dw2: [0, 8], dw3: [0, 14], dw4: [0, 16], mid: [0, 1], tdd: [1, 3] } as const
    const now = Object.fromEntries(
      Object.entries({ dw2, dw3, dw4, mid, tdd }).map(([name, md]) => {
        const c = parseScratchpad(md).criteria

        return [name, [c.filter(x => x.state === 'met').length, c.length]]
      }),
    )

    expect(now).toEqual(was)
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
