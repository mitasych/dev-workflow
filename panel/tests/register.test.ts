import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import mid from './fixtures/mid'

const ROOT = '/proj'
const SCRATCH = `${ROOT}/.workflow/current-issue.md`
const DONE = `${mid}\n## Implementation Status\n\n**Steps completed**: 3 of 3\n**Blocked steps**: none\n`

// The engine beneath the plugin, in memory: a file map, the status line, panes.
const world = (on: On, files: Record<string, string>) => {
  const w = {
    files: new Map(Object.entries(files)),
    mtime: 1,
    reads: 0,
    stateWrites: 0,
    panes: [] as string[],
    opens: 0,
    isReadFailing: false,
    isPaneHidden: false,
    lastOpen: null as { rows?: number; columns?: number } | null,
    toasts: [] as string[],
    toastMs: [] as (number | undefined)[],
    // The session's model and the /config Model row; setting the row switches both.
    model: 'claude-sonnet-5-5',
    saved: 'sonnet',
    denied: [] as string[],
    sets: [] as string[],
    // Raised while a config.set runs, where the engine reports the model switch.
    onSet: null as (() => Promise<unknown>) | null,
    isSetThrowing: false,
    // The plugin's $.store, kept across "sessions" within a test.
    store: new Map<string, unknown>(),
    // The questions put to the person, and what they answer (null: dismissed).
    asked: [] as string[],
    answer: null as string | null,
    // What the model request under the plugin reports having read and written.
    usage: { model: 'claude-opus-5-5', input_tokens: 2, output_tokens: 9, cache_read_input_tokens: 600, cache_creation_input_tokens: 100000 },
    // The session's running cost, as /cost totals it; a resumed session starts above 0. null: the host keeps none.
    cost: 52.04 as number | null,
    // Holds the next usage read's answer back, as a slow engine call would; `onUsage` hears the read.
    usageGate: null as Promise<void> | null,
    onUsage: null as (() => void) | null,
  }
  on('session.usage', async () => {
    const cost = w.cost
    w.onUsage?.()
    const gate = w.usageGate
    w.usageGate = null
    if (gate !== null) await gate

    return {
      value: {
        startedAt: 0,
        context: { window: 200000 },
        rateLimits: [],
        ...(cost === null ? {} : { cost: { usd: cost } }),
      },
    }
  })
  on('session.model', () => ({ value: w.model }))
  on('config.list', () => ({
    value: [{ key: 'model', label: 'Model', kind: 'choice' as const, value: w.saved, provider: { plugin: 'engine', tier: 'core' as const }, isLocked: false }],
  }))
  on('config.set', async (_$, e) => {
    if (w.isSetThrowing) throw new Error('row locked')
    const value = String(e.value)
    if (w.denied.includes(value)) return { deny: `${value} is not an option` }
    w.sets.push(value)
    w.saved = value
    w.model = `claude-${value}-5-5`
    await w.onSet?.()

    return { value }
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    w.toastMs.push(e.timeoutMs)

    return { value: undefined }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const q = e.questions[0]
    w.asked.push(`${q?.question} [${q?.options.map(o => o.label).join(' | ')}]`)
    if (w.answer === null) return { deny: 'dismissed' }

    return { result: { questions: e.questions, answers: { [q?.question ?? '']: w.answer } }, text: w.answer }
  })
  on('store.get', (_$, e) => ({ value: w.store.get(e.key) }))
  on('store.set', (_$, e) => {
    w.store.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    w.store.delete(e.key)

    return { value: undefined }
  })
  on('classic.PostModelSwitch', () => ({}))
  on('classic.PostCompact', () => ({}))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: w.usage }

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: w.usage }
  })
  on('session.cwd', () => ({ value: ROOT }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_$, e) => ({ value: w.files.has(e.path) }))
  on('fs.stat', (_$, e) => ({
    value: {
      kind: 'file' as const,
      size: (w.files.get(e.path) ?? '').length,
      mtimeMs: w.mtime,
      isLink: false,
    },
  }))
  on('fs.read', (_$, e) => {
    w.reads += 1

    return w.isReadFailing ? { deny: 'disk gone' } : { value: w.files.get(e.path) ?? '' }
  })
  on('ui.open', (_$, e) => {
    w.opens += 1
    w.lastOpen = { rows: e.rows, columns: e.columns }
    if (!w.panes.includes(e.id)) w.panes.push(e.id)

    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    w.panes = w.panes.filter(id => id !== e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: w.panes.map(id => ({ id, title: id, isShown: !w.isPaneHidden, isFocused: false, isPlaced: true })),
  }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  // the engine's own band, drawn when the plugin passes
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))
  on('skill.prompt', (_$, e) => ({ text: e.text }))
  on('tool.call', { tool: 'Edit' }, (_$, e) => ({
    result: { filePath: e.file_path, oldString: e.old_string, newString: e.new_string },
    text: 'ok',
  }))
  on('tool.call', { tool: 'Write' }, (_$, e) => ({
    result: { type: 'update' as const, filePath: e.file_path, content: e.content },
    text: 'ok',
  }))

  return w
}

const PANEL = {
  command: 'workflow-panel',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const
const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
// The band above the prompt: its head line and the step marked current.
const band = async ($: Engine) => {
  const ui = await $.ui.mount({
    plugin: 'dev-workflow',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
    viewport: { columns: 120, rows: 40 },
  })
  const head = (await ui.find({ type: 'Text', text: / · / }))?.text
  const current = (await ui.find({ type: 'Text', text: /^▸/ }))?.text
  await ui.unmount()

  return { head, current }
}

test('session start shows the issue on the status line', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)

  await $.session.start(START)

  expect(await band($)).toEqual({ head: 'APP-12 · Add settings page', current: '▸implement 0/3' })
})

test('with no scratchpad the band is the engine\'s own', async ($, on) => {
  const w = world(on, {})
  mock.clock(on)

  await $.session.start(START)

  expect((await band($)).head).toBeUndefined()
})

test('a typed workflow skill marks its step in progress', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt({ skill: 'dev-workflow:workflow-test', text: 'go' })

  expect((await band($)).current).toBe('▸test')
})

test('an edit to a planned file is inferred and shown as a guess', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await $.skill.prompt({ skill: 'workflow-implement', text: 'go' })

  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/src/router.ts`, old_string: 'a', new_string: 'b' })

  expect((await band($)).current).toBe('▸implement ~1/3')
})

test('a write to the scratchpad refreshes at once', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  w.files.set(SCRATCH, DONE)
  w.mtime += 1
  await $.tool.call({ tool: 'Write', file_path: SCRATCH, content: DONE })

  expect((await band($)).current).toBe('▸test')
})

test('an outside edit is picked up by the poll, and only when the file changed', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  const clock = mock.clock(on)
  await $.session.start(START)
  const before = w.reads

  await clock.advance(3000)
  expect(w.reads).toBe(before)

  w.files.set(SCRATCH, DONE)
  w.mtime += 1
  await clock.advance(3000)
  expect((await band($)).current).toBe('▸test')
})

test('/workflow-panel opens the pane, then closes it', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  const opened = await $.command.run(PANEL)
  expect(opened.text).toContain('Workflow panel opened above the prompt')
  expect(w.panes).toEqual(['workflow'])

  const closed = await $.command.run(PANEL)
  expect(closed.text).toBe('Workflow panel closed.')
  expect(w.panes).toEqual([])
})

test('autoOpen is off by default: a skill does not open the pane', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt({ skill: 'workflow-implement', text: 'go' })

  expect(w.opens).toBe(0)
})

test('autoOpen opens the pane on the first workflow skill only', { options: { autoOpen: true } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt({ skill: 'workflow-implement', text: 'go' })
  await $.skill.prompt({ skill: 'workflow-test', text: 'go' })

  expect(w.opens).toBe(1)
})

test('a failing read never reaches the skill', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  w.isReadFailing = true
  mock.clock(on)

  const out = await $.skill.prompt({ skill: 'workflow-plan', text: 'go' })

  expect(out.text).toBe('go')
})

test('the pane lists steps and plan steps on every surface', async ($, on) => {
  world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/src/router.ts`, old_string: 'a', new_string: 'b' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'dev-workflow',
      surface,
      component: 'Pane',
      requestId: 'workflow',
      props: {
        title: 'Workflow',
        isFocused: false,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 40 },
        view: {},
      },
      viewport: { columns: 120, rows: 40 },
    })

    expect(await ui.find({ type: 'Text', text: /APP-12 · Add settings page/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Build the page/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Create the page component/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /~✅ 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Add the route/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Next: \/workflow-implement/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane says so when there is no workflow', async ($, on) => {
  world(on, {})
  mock.clock(on)
  await $.session.start(START)

  const ui = await $.ui.mount({
    plugin: 'dev-workflow',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'workflow',
    props: {
      title: 'Workflow',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
    viewport: { columns: 120, rows: 40 },
  })

  expect(await ui.find({ type: 'Text', text: /No active workflow/ })).toBeDefined()
})

const EDIT_ROUTER = { tool: 'Edit', file_path: `${ROOT}/src/router.ts`, old_string: 'a', new_string: 'b' } as const

test('edits from the previous issue do not carry across the archive gap', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  const clock = mock.clock(on)
  await $.session.start(START)
  await $.tool.call(EDIT_ROUTER)
  expect((await band($)).current).toBe('▸implement ~1/3')

  // clarify archives the old scratchpad, the poll sees nothing, then the new issue lands
  w.files.delete(SCRATCH)
  await clock.advance(3000)
  w.files.set(SCRATCH, mid.replace('APP-12', 'APP-13'))
  w.mtime += 1
  await clock.advance(3000)

  expect(await band($)).toEqual({ head: 'APP-13 · Add settings page', current: '▸implement 0/3' })
})

test('edits made before there is a plan are not counted', async ($, on) => {
  const unplanned = '# Issue: Add settings page\n**Source**: APP-12\n'
  const w = world(on, { [SCRATCH]: unplanned })
  mock.clock(on)
  await $.session.start(START)
  await $.tool.call(EDIT_ROUTER)

  w.files.set(SCRATCH, mid)
  w.mtime += 1
  await $.tool.call({ tool: 'Write', file_path: SCRATCH, content: mid })

  expect((await band($)).current).toBe('▸implement 0/3')
})

test('an idle poll with no scratchpad writes no state', async ($, on) => {
  const w = world(on, {})
  on('state.set', async (_$, e, next) => {
    w.stateWrites += 1

    return next(e)
  })
  const clock = mock.clock(on)
  await $.session.start(START)
  const before = w.stateWrites

  await clock.advance(3000 * 5)

  expect(w.stateWrites).toBe(before)
})

test('/workflow-panel brings a pane hidden behind another tab forward', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await $.command.run(PANEL)
  w.isPaneHidden = true

  const again = await $.command.run(PANEL)

  expect(again.text).toContain('Workflow panel opened')
  expect(w.panes).toEqual(['workflow'])
})

const pane = (placement: 'dock' | 'inline', bodyRows: number) =>
  ({
    plugin: 'dev-workflow',
    component: 'Pane',
    requestId: 'workflow',
    props: {
      title: 'Workflow',
      isFocused: false,
      bodyColumns: 56,
      placement,
      scroll: { offset: 0, bodyRows },
      view: {},
    },
    viewport: { columns: 120, rows: 40 },
  }) as const

test('/workflow-panel says why the pane is inline, and asks for room for the plan', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  const out = await $.command.run({ ...PANEL, presentation: { isFullscreen: false, columns: 96 } })

  expect(out.text).toContain('For a right sidebar, run /tui fullscreen')
  expect(w.lastOpen).toEqual({ rows: 12, columns: 56 })
})

test('/workflow-panel reports a sidebar in a wide fullscreen terminal', async ($, on) => {
  world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  const out = await $.command.run({ ...PANEL, presentation: { isFullscreen: true, columns: 160 } })

  expect(out.text).toBe('Workflow panel opened as a right sidebar.')
})

test('a cramped inline pane still lists every plan step with its status', async ($, on) => {
  world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('inline', 6), surface })

    expect(await ui.find({ type: 'Text', text: /Implement/ })).toBeUndefined()
    for (const step of [/⬜ 1/, /⬜ 2/, /⬜ 3/, /Add the route/, /Build the page/, /Link it from the menu/]) {
      expect(await ui.find({ type: 'Text', text: step })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /Create the page component/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a docked sidebar gives every plan step its brief, and leaves the workflow steps to the band', async ($, on) => {
  world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...pane('dock', 40), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Create the page component/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Clarify|Implement\b/ })).toBeUndefined()
})

test('the band marks done, current, failed and pending steps', async ($, on) => {
  world(on, { [SCRATCH]: `${mid}\n## Code Review\n\n**Verdict**: ❌ Request changes\n` })
  mock.clock(on)
  await $.session.start(START)

  const ui = await $.ui.mount({
    plugin: 'dev-workflow',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
    viewport: { columns: 120, rows: 40 },
  })

  for (const mark of ['✓clarify', '✓plan', '▸implement 0/3', '·test', '✗review', '·release']) {
    expect(await ui.find({ type: 'Text', text: mark })).toBeDefined()
  }
})

test('/workflow-panel in a narrow fullscreen terminal asks for width', async ($, on) => {
  world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  const out = await $.command.run({ ...PANEL, presentation: { isFullscreen: true, columns: 90 } })

  expect(out.text).toContain('widen the terminal to 110+ columns (now 90)')
})

const REVIEWED = `${mid}
## Code Review

**Verdict**: ⚠️ Approve with comments

### Findings requiring action
- [C1] Crash on empty list — \`src/router.ts\`
- [W1] Slow poll — \`src/Menu.tsx\`

### Suggestions
- [S1] Rename the page — \`src/pages/Settings.tsx\`

## Review Fixes
- [C1] Guarded the empty list
`

test('a docked sidebar lists every review finding with its state', async ($, on) => {
  world(on, { [SCRATCH]: REVIEWED })
  mock.clock(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...pane('dock', 40), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Review \(2 open of 3\)/ })).toBeDefined()
  // The marker and id are colored; the title is its own plain Text.
  expect(await ui.find({ type: 'Text', text: /✅ C1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Crash on empty list/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /🟡 W1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Slow poll/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /🔵 S1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Rename the page/ })).toBeDefined()
})

test('inline, settled findings fold into a count', async ($, on) => {
  world(on, { [SCRATCH]: REVIEWED })
  mock.clock(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('inline', 8), surface })

    expect(await ui.find({ type: 'Text', text: /🟡 W1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /C1 Crash on empty list/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /✅ 1 resolved/ })).toBeDefined()
    await ui.unmount()
  }
})

const CRITERIA = mid.replace(
  '- [ ] Given the menu, Then Settings is listed',
  [
    '- [x] Given the menu, Then Settings is listed',
    '- [x] Given a saved choice, Then it survives a reload',
    '- [!] Given a bad value, Then the form says why',
    '- [~] Given a narrow window, Then the page still fits',
    '- [?] Given a screen reader, Then the page is announced',
    '- [ ] Given a slow network, Then a spinner shows',
  ].join('\n'),
)

test('a docked sidebar counts the five criterion states and lists every one not met', async ($, on) => {
  world(on, { [SCRATCH]: CRITERIA })
  mock.clock(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('dock', 40), surface })

    expect(await ui.find({ type: 'Text', text: /Criteria 2\/6/ })).toBeDefined()
    for (const part of [/1 failed/, /1 partly/, /1 unverified/, /1 open/]) {
      expect(await ui.find({ type: 'Text', text: part })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /Criteria \(4 not met\)/ })).toBeDefined()
    for (const text of [/the form says why/, /still fits/, /is announced/, /a spinner shows/]) {
      expect(await ui.find({ type: 'Text', text })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /Settings is listed/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /1 met/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('an inline pane lists only the failed and partly criteria', async ($, on) => {
  world(on, { [SCRATCH]: CRITERIA })
  mock.clock(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('inline', 12), surface })

    expect(await ui.find({ type: 'Text', text: /1 unverified/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /the form says why/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /still fits/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /is announced/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /a spinner shows/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a scratchpad with only [ ] and [x] boxes reads as before', async ($, on) => {
  const legacy = mid.replace(
    '- [ ] Given the menu, Then Settings is listed',
    '- [x] Given the menu, Then Settings is listed\n- [ ] Given a saved choice, Then it survives',
  )
  world(on, { [SCRATCH]: legacy })
  mock.clock(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...pane('dock', 40), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Criteria 1\/2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 open/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Criteria \(1 not met\)/ })).toBeDefined()
})

test('no criteria section means no criteria line and no list', async ($, on) => {
  const bare = mid.replace(/## Acceptance Criteria\n- \[ \] Given the menu, Then Settings is listed\n\n/, '')
  world(on, { [SCRATCH]: bare })
  mock.clock(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...pane('dock', 40), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Plan \(3 steps\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Criteria/ })).toBeUndefined()
})

test('criteria counts take their state color, and the criterion text stays plain and truncated', async ($, on) => {
  world(on, { [SCRATCH]: CRITERIA })
  mock.clock(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('dock', 40), surface })
    const color = async (text: RegExp) => (await ui.find({ type: 'Text', text }))?.props.color

    expect(await color(/Criteria 2\/6/)).toBe('warning')
    expect(await color(/1 failed/)).toBe('error')
    expect(await color(/1 partly/)).toBe('warning')
    expect(await color(/1 unverified/)).toBe('suggestion')
    expect(await color(/1 open/)).toBe('inactive')
    expect(await color(/^❌ $/)).toBe('error')
    expect(await color(/^🔍 $/)).toBe('suggestion')
    expect(await ui.find({ type: 'Text', text: /🌓 1 partly/ })).toBeDefined()

    const title = await ui.find({ type: 'Text', text: /the form says why/ })

    expect(title?.props.color).toBeUndefined()
    expect(title?.props.wrap).toBe('truncate')
    await ui.unmount()
  }
})

test('once every criterion is met the line turns green and the list goes away', async ($, on) => {
  const met = mid.replace(
    '- [ ] Given the menu, Then Settings is listed',
    '- [x] Given the menu, Then Settings is listed\n- [x] Given a saved choice, Then it survives',
  )
  world(on, { [SCRATCH]: met })
  mock.clock(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...pane('dock', 40), surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /Criteria 2\/2/ }))?.props.color).toBe('success')
  expect(await ui.find({ type: 'Text', text: /not met/ })).toBeUndefined()
})

test('inline, the criteria heading says how many of the unmet ones it lists', async ($, on) => {
  world(on, { [SCRATCH]: CRITERIA })
  mock.clock(on)
  await $.session.start(START)

  const inline = await $.ui.mount({ ...pane('inline', 12), surface: 'terminal' })

  expect(await inline.find({ type: 'Text', text: /Criteria \(2 of 4 not met\)/ })).toBeDefined()
  await inline.unmount()

  const docked = await $.ui.mount({ ...pane('dock', 40), surface: 'terminal' })

  expect(await docked.find({ type: 'Text', text: /Criteria \(4 not met\)/ })).toBeDefined()
})

test('an inline pane with room for the plan shows its briefs', async ($, on) => {
  world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  const roomy = await $.ui.mount({ ...pane('inline', 16), surface: 'terminal' })

  expect(await roomy.find({ type: 'Text', text: /Create the page component/ })).toBeDefined()
  await roomy.unmount()
})

test('with failed and partly criteria listed, the same pane drops the briefs', async ($, on) => {
  world(on, { [SCRATCH]: CRITERIA })
  mock.clock(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...pane('inline', 16), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /the form says why/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Create the page component/ })).toBeUndefined()
})

const SWITCHED = {
  from_model: 'claude-sonnet-5-5',
  to_model: 'claude-opus-5-5',
  requested_model: 'opus',
  source: 'command',
  context_tokens: 182340,
  prompt_cache_warm: true,
  cache_ttl: '1h',
  estimated_cache_write_usd: 1.1396,
  pricing: 'catalog',
} as const

const paneText = async ($: Engine, pattern: RegExp) => {
  const ui = await $.ui.mount({
    plugin: 'dev-workflow',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'workflow',
    props: {
      title: 'Workflow',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
    viewport: { columns: 120, rows: 40 },
  })
  const text = (await ui.find({ type: 'Text', text: pattern }))?.text
  await ui.unmount()

  return text
}

test('a model switch toasts the cache it threw away, and one overtaken before any request costs nothing', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  expect(await paneText($, /^Switches:/)).toBeUndefined()

  await $.classic.PostModelSwitch(SWITCHED)
  await $.classic.PostModelSwitch({ ...SWITCHED, prompt_cache_warm: false })

  expect(w.toasts).toEqual([
    'sonnet → opus · re-cache up to 182,340 tokens ≈ $1.14 — measuring…',
    'sonnet → opus · cache already cold, nothing lost',
  ])
  expect(w.toastMs).toEqual([15000, 15000])
  // Opus never answered, so it cached nothing; the second found the cache already cold.
  expect(await paneText($, /^Switches:/)).toBe('Switches: 2 · ≈ $0.00')
})

test('the switch total shows on the empty pane too', async ($, on) => {
  world(on, {})
  mock.clock(on)
  await $.session.start(START)

  await $.classic.PostModelSwitch(SWITCHED)

  expect(await paneText($, /No active workflow/)).toBeDefined()
  expect(await paneText($, /^Switches:/)).toBe('Switches: 1 · 182k tokens ≈ $1.14')
})

test('a resumed session restores its model without a toast or a count', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.classic.PostModelSwitch({ ...SWITCHED, source: 'resume' })
  await $.classic.PostModelSwitch({ ...SWITCHED, context_tokens: 0 })

  expect(w.toasts).toEqual([])
  expect(await paneText($, /^Switches:/)).toBeUndefined()
})

test('showSwitchCost off: no toast and no total', { options: { showSwitchCost: false } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.classic.PostModelSwitch(SWITCHED)

  expect(w.toasts).toEqual([])
  expect(await paneText($, /^Switches:/)).toBeUndefined()
})

test('a switch still waiting when showSwitchCost goes off is dropped, not measured', { options: { showSwitchCost: false } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  const { from_model, to_model, context_tokens, prompt_cache_warm, estimated_cache_write_usd, pricing } = SWITCHED
  // Stored by the switch while the option was still on.
  let stored: unknown = { e: { from_model, to_model, context_tokens, prompt_cache_warm, estimated_cache_write_usd, pricing }, lead: null }
  let version = 1
  on('state.get', (_$, e, next) => (e.key === 'pendingSwitch' ? { value: { value: stored, version } } : next(e)))
  // Answered here, so the next read sees the write's version and the update lands.
  on('state.set', (_$, e, next) => {
    if (e.key !== 'pendingSwitch') return next(e)
    stored = e.value
    version += 1

    return { value: { isSet: true, version } }
  })
  await $.session.start(START)

  w.usage = { ...w.usage, model: to_model }
  await step($)

  expect(w.toasts).toEqual([])
  expect(stored).toBeNull()
})

test('a switch total stored by 1.11.0 reads as none after a reload', async ($, on) => {
  world(on, { [SCRATCH]: mid })
  mock.clock(on)
  const old = { count: 2, tokens: 182340, usd: 1.14, isGuess: true }
  on('state.get', (_$, e, next) => (e.key === 'switches' ? { value: { value: old, version: 1 } } : next(e)))
  await $.session.start(START)

  expect(await paneText($, /^Switches:/)).toBeUndefined()
})

const TYPED = { 'disable-model-invocation': true } as const
const OURS = { pluginName: 'dev-workflow' } as const
const PLAN = { ...OURS, skill: 'dev-workflow:workflow-plan', text: 'go', frontmatter: { ...TYPED, model: 'opus', 'multi-turn': true } }
const HELP = { ...OURS, skill: 'dev-workflow:workflow-help', text: 'go', frontmatter: { ...TYPED, model: 'haiku' } }
const COMMIT = { ...OURS, skill: 'dev-workflow:workflow-commit', text: 'go', frontmatter: { ...TYPED, model: 'opus' } }
const BRANCH = { ...OURS, skill: 'dev-workflow:workflow-branch', text: 'go', frontmatter: { 'disable-model-invocation': false, model: 'opus' } }

test('modelSwitch is off by default: a skill never switches or hints', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt(PLAN)

  expect(w.sets).toEqual([])
  expect(w.toasts).toEqual([])
})

test('suggest asks before the skill\'s prompt is sent, and switches on a yes', { options: { modelSwitch: 'suggest' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.answer = 'Switch to opus'
  await $.session.start(START)

  const { text } = await $.skill.prompt(PLAN)

  expect(text).toBe('go')
  expect(w.asked).toEqual(['/workflow-plan runs on opus. Switch this session to opus too? It is on sonnet. [Switch to opus | Stay on sonnet]'])
  expect(w.sets).toEqual(['opus'])
  expect(w.toasts).toEqual(['Model → opus for /workflow-plan'])
})

test('suggest leaves the model alone on a no or a dismissed dialog', { options: { modelSwitch: 'suggest' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  w.answer = 'Stay on sonnet'
  const stayed = await $.skill.prompt(PLAN)
  w.answer = null
  const dismissed = await $.skill.prompt(PLAN)

  expect(stayed.text).toBe('go')
  expect(dismissed.text).toBe('go')
  expect(w.asked.length).toBe(2)
  expect(w.sets).toEqual([])
  expect(w.toasts).toEqual([])
})

test('suggest does not ask when the skill\'s model is the session\'s, or is unknown', { options: { modelSwitch: 'suggest' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.answer = 'Switch to opus'
  await $.session.start(START)

  await $.skill.prompt({ ...PLAN, frontmatter: { ...TYPED, model: 'sonnet' } })
  await $.skill.prompt({ ...PLAN, frontmatter: { ...TYPED, model: 'inherit' } })

  expect(w.asked).toEqual([])
})

test('upgrade switches before the skill\'s prompt is sent, keeps the default to restore, and a reload restores nothing', { options: { modelSwitch: 'upgrade' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  const { text } = await $.skill.prompt(PLAN)

  expect(text).toBe('go')
  expect(w.sets).toEqual(['opus'])
  expect(w.model).toBe('claude-opus-5-5')
  expect(w.toasts).toEqual(['Model → opus for /workflow-plan'])
  expect(w.toastMs).toEqual([15000])
  expect(w.store.get('restoreModel')).toEqual({ original: 'sonnet', wrote: 'opus' })

  // a hot reload runs session.start again in the same session
  await $.session.start(START)

  expect(w.sets).toEqual(['opus'])
  expect(w.model).toBe('claude-opus-5-5')
})

test('with a warm cache the skill\'s switch is one toast that carries the cache it cost', { options: { modelSwitch: 'upgrade' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.onSet = () => $.classic.PostModelSwitch(SWITCHED)
  await $.session.start(START)

  await $.skill.prompt(PLAN)

  expect(w.toasts).toEqual(['Model → opus for /workflow-plan · re-cache up to 182,340 tokens ≈ $1.14 — measuring…'])
  expect(w.toastMs).toEqual([15000])
  expect(await paneText($, /^Switches:/)).toBe('Switches: 1 · 182k tokens ≈ $1.14')
})

const step = async ($: Engine, extra: { agentId?: string; model?: string } = {}) => {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3, ...extra })
  for await (const _ of stream) void _
  await stream.result
}

test('the first request after a switch replaces the estimate with what it wrote, once', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await $.classic.PostModelSwitch(SWITCHED)

  await step($)
  await step($)

  expect(w.toasts).toEqual([
    'sonnet → opus · re-cache up to 182,340 tokens ≈ $1.14 — measuring…',
    'sonnet → opus · re-cached 100,000 of 100,600 tokens ≈ $0.62 (measured)',
  ])
  expect(w.toastMs).toEqual([15000, 15000])
  expect(await paneText($, /^Switches:/)).toBe('Switches: 1 · 100k tokens ≈ $0.62')
})

test('a model whose cache survived is measured at what it re-wrote', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  w.usage = { ...w.usage, cache_read_input_tokens: 322131, cache_creation_input_tokens: 821 }
  await $.classic.PostModelSwitch(SWITCHED)

  await step($)

  expect(w.toasts[1]).toBe('sonnet → opus · re-cached 821 of 322,952 tokens ≈ <$0.01 (measured)')
  expect(await paneText($, /^Switches:/)).toBe('Switches: 1 · 821 tokens ≈ <$0.01')
})

test('a subagent\'s request, another model\'s, or a cold-cache switch is never measured', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.classic.PostModelSwitch(SWITCHED)
  await step($, { agentId: 'a1' })
  w.usage = { ...w.usage, model: 'claude-haiku-5-5' }
  await step($)
  await $.classic.PostModelSwitch({ ...SWITCHED, prompt_cache_warm: false })
  w.usage = { ...w.usage, model: 'claude-opus-5-5' }
  await step($)

  expect(w.toasts.filter(t => t.includes('(measured)'))).toEqual([])
  // The haiku request used up the measurement without being able to make it: the estimate stays, marked.
  expect(await paneText($, /^Switches:/)).toBe('Switches: 2 · 182k tokens ≈ $1.14 (rough guess)')
})

test('upgrade never switches down', { options: { modelSwitch: 'upgrade' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.model = 'claude-opus-5-5'
  await $.session.start(START)

  await $.skill.prompt(HELP)

  expect(w.sets).toEqual([])
})

test('multi-turn switches only for a skill flagged multi-turn, learn-code included', { options: { modelSwitch: 'multi-turn' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt(COMMIT)
  expect(w.sets).toEqual([])

  await $.skill.prompt({ ...OURS, skill: 'dev-workflow:learn-code', text: 'go', frontmatter: { ...TYPED, model: 'opus', 'multi-turn': true } })
  expect(w.sets).toEqual(['opus'])
})

test('inherit or no model never switches', { options: { modelSwitch: 'always' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt({ ...PLAN, frontmatter: { ...TYPED, model: 'inherit' } })
  await $.skill.prompt({ ...PLAN, frontmatter: { ...TYPED } })

  expect(w.sets).toEqual([])
})

test('a skill the model may invoke never switches the session', { options: { modelSwitch: 'always' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt(BRANCH)
  await $.skill.prompt({ ...BRANCH, frontmatter: { model: 'opus' } })

  expect(w.sets).toEqual([])
  expect(w.toasts).toEqual([])
})

test('a refused switch says so once, leaves the skill running, and is not retried', { options: { modelSwitch: 'always' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.denied = ['opus']
  await $.session.start(START)

  const { text } = await $.skill.prompt(PLAN)
  await $.session.start(START)

  expect(text).toBe('go')
  expect(w.sets).toEqual([])
  expect(w.toasts).toEqual(['Model not switched to opus: opus is not an option'])
  expect(w.store.has('restoreModel')).toBe(false)
})

test('a default the person changed since the switch is kept', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.store.set('restoreModel', { original: 'sonnet', wrote: 'opus' })
  w.saved = 'haiku'

  await $.session.start(START)

  expect(w.sets).toEqual([])
})

test('a full-id default the row refuses goes back as its alias', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.store.set('restoreModel', { original: 'claude-sonnet-5-5', wrote: 'opus' })
  w.saved = 'opus'
  w.denied = ['claude-sonnet-5-5']

  await $.session.start(START)

  expect(w.sets).toEqual(['sonnet'])
})

test('always follows each skill\'s model, up and down', { options: { modelSwitch: 'always' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt(PLAN)
  await $.skill.prompt(HELP)

  expect(w.sets).toEqual(['opus', 'haiku'])
  expect(w.model).toBe('claude-haiku-5-5')
})

test('a model the person chose in between does not pause the setting', { options: { modelSwitch: 'always' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt(PLAN)
  w.model = 'claude-sonnet-5-5'
  w.saved = 'sonnet'
  await $.skill.prompt(PLAN)

  expect(w.sets).toEqual(['opus', 'opus'])
})

test('every kind of switch is reported, the person\'s picker and an automatic fallback too', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.classic.PostModelSwitch({ ...SWITCHED, source: 'picker' })
  await $.classic.PostModelSwitch({ ...SWITCHED, source: 'auto', requested_model: null })

  expect(w.toasts.length).toBe(2)
  // The first was overtaken before any request: only the second's estimate stands.
  expect(await paneText($, /^Switches:/)).toBe('Switches: 2 · 182k tokens ≈ $1.14')
})

test('a switch overtaken by another drops its estimate, and the next request measures the second', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.classic.PostModelSwitch(SWITCHED)
  await $.classic.PostModelSwitch({ ...SWITCHED, from_model: 'claude-opus-5-5', to_model: 'claude-haiku-5-5', estimated_cache_write_usd: 0.1823 })
  w.usage = { ...w.usage, model: 'claude-haiku-5-5', cache_read_input_tokens: 0, cache_creation_input_tokens: 182340 }
  await step($)

  expect(await paneText($, /^Switches:/)).toBe('Switches: 2 · 182k tokens ≈ $0.18')
})

test('after several switches the default to restore is still the one from before the first', { options: { modelSwitch: 'always' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt(PLAN)
  await $.skill.prompt(HELP)

  expect(w.saved).toBe('haiku')
  expect(w.store.get('restoreModel')).toEqual({ original: 'sonnet', wrote: 'haiku' })
})

test('the next session puts the default back and forgets it', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.store.set('restoreModel', { original: 'sonnet', wrote: 'opus' })
  w.saved = 'opus'

  await $.session.start(START)

  expect(w.sets).toEqual(['sonnet'])
  expect(w.store.has('restoreModel')).toBe(false)
})

test('a deliberately picked variant of the same family is kept', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.store.set('restoreModel', { original: 'sonnet', wrote: 'opus' })
  w.saved = 'opus[1m]'

  await $.session.start(START)

  expect(w.sets).toEqual([])
})

test('a skill from another plugin or the person\'s own skills never switches; this plugin\'s does by its prefix alone', { options: { modelSwitch: 'always' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await $.skill.prompt({ ...PLAN, pluginName: 'other', skill: 'other:workflow-plan' })
  await $.skill.prompt({ skill: 'workflow-plan', text: 'go', frontmatter: PLAN.frontmatter })

  expect(w.sets).toEqual([])

  await $.skill.prompt({ skill: 'dev-workflow:workflow-plan', text: 'go', frontmatter: PLAN.frontmatter })

  expect(w.sets).toEqual(['opus'])
})

test('a switch call that fails leaves no label for a later switch\'s toast', { options: { modelSwitch: 'always' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  w.isSetThrowing = true

  const { text } = await $.skill.prompt(PLAN)
  await $.classic.PostModelSwitch(SWITCHED)

  expect(text).toBe('go')
  expect(w.toasts).toEqual(['sonnet → opus · re-cache up to 182,340 tokens ≈ $1.14 — measuring…'])
})

test('after a switch the pane asks for a row for its total', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await $.classic.PostModelSwitch(SWITCHED)

  await $.command.run({ ...PANEL, presentation: { isFullscreen: false, columns: 96 } })

  expect(w.lastOpen).toEqual({ rows: 13, columns: 56 })
})

type World = ReturnType<typeof world>

// A response whose cost rose by `rise` since the last one.
const priced = async ($: Engine, w: World, rise: number, extra: { agentId?: string } = {}) => {
  w.cost = (w.cost ?? 0) + rise
  await step($, extra)
}

const HAIKU = { model: 'claude-haiku-5-5', input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 0, cache_creation_input_tokens: 41883 }

test('spendReport is off by default: nothing is kept or shown', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await priced($, w, 0.1)

  expect(await paneText($, /^Spend/)).toBeUndefined()
  expect(await paneText($, /^opus/)).toBeUndefined()
})

test('total: what the cost rose by since the session started', { options: { spendReport: 'total' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await priced($, w, 0.1)
  await priced($, w, 0.25)

  expect(await paneText($, /^Spend/)).toBe('Spend $0.35')
  expect(await paneText($, /^opus/)).toBeUndefined()
})

test('total: the share the switches caused', { options: { spendReport: 'total' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await $.classic.PostModelSwitch(SWITCHED)
  await priced($, w, 5.7)

  expect(await paneText($, /^Spend/)).toBe('Spend $5.70 · switches $0.62 (11%)')
})

test('total: no share with showSwitchCost off', { options: { spendReport: 'total', showSwitchCost: false } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await $.classic.PostModelSwitch(SWITCHED)
  await priced($, w, 5.7)

  expect(await paneText($, /^Spend/)).toBe('Spend $5.70')
})

test('model: dollars and tokens per model, dearest first', { options: { spendReport: 'model' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await priced($, w, 0.5)
  w.usage = HAIKU
  await priced($, w, 0.1)

  expect(await paneText($, /^opus/)).toBe('opus   $0.50 · 100k new · 600 cached · 9 out')
  expect(await paneText($, /^haiku/)).toBe('haiku  $0.10 · 42k new · 0 cached · 4 out')
})

test('model: a subagent has its own token line, and its dollars stay with its model', { options: { spendReport: 'model' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  w.usage = HAIKU
  await priced($, w, 0.05, { agentId: 'a1' })

  expect(await paneText($, /^subagents/)).toBe('subagents  42k new · 0 cached · 4 out')
  expect(await paneText($, /^haiku/)).toBe('haiku      $0.05')
})

test('a compaction and spend between turns go to other, not to the next response', { options: { spendReport: 'model' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  w.cost = (w.cost ?? 0) + 0.12
  await $.classic.PostCompact({ trigger: 'manual' } as never)
  w.cost += 0.03
  await $.turn.start({ text: 'go', turnId: 't2' })
  await priced($, w, 0.2)

  expect(await paneText($, /^other/)).toBe('other  $0.15')
  expect(await paneText($, /^opus/)).toBe('opus   $0.20 · 100k new · 600 cached · 9 out')
})

test('a subagent starting a turn does not flush the main loop\'s spend', { options: { spendReport: 'model' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  w.cost = (w.cost ?? 0) + 0.3
  await $.turn.start({ text: 'go', turnId: 't3', agentId: 'a1' })
  await priced($, w, 0)

  expect(await paneText($, /^other/)).toBeUndefined()
})

test('step: dollars per workflow step, none before the first', { options: { spendReport: 'step' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)

  await priced($, w, 0.2)
  await $.skill.prompt({ skill: 'dev-workflow:workflow-plan', text: 'go' })
  await priced($, w, 0.6)

  expect(await paneText($, /^plan /)).toBe('plan $0.60 · none $0.20')
})

test('a cost that restarted below the baseline credits nothing', { options: { spendReport: 'total' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await priced($, w, 0.4)

  w.cost = 0.05
  await step($)
  await priced($, w, 0.1)

  expect(await paneText($, /^Spend/)).toBe('Spend $0.50')
})

test('a host with no cost ledger marks the model unpriced', { options: { spendReport: 'model' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  w.cost = null
  await $.session.start(START)

  await step($)

  expect(await paneText($, /^Spend/)).toBe('Spend $0.00 + unpriced')
  expect(await paneText($, /^opus/)).toBe('opus  unpriced · 100k new · 600 cached · 9 out')
})

test('a reload keeps the ledger and does not re-seed it', { options: { spendReport: 'total' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await priced($, w, 0.3)

  await $.session.start(START)

  expect(await paneText($, /^Spend/)).toBe('Spend $0.30')
})

test('the empty-state pane shows the block too', { options: { spendReport: 'model' } }, async ($, on) => {
  const w = world(on, {})
  mock.clock(on)
  await $.session.start(START)
  await priced($, w, 0.5)

  expect(await paneText($, /^Spend/)).toBe('Spend $0.50')
  expect(await paneText($, /^opus/)).toBe('opus  $0.50 · 100k new · 600 cached · 9 out')
})

const quietLedger = async ($: Engine, on: On, w: World) => {
  let writes = 0
  on('state.set', async (_$, e, next) => {
    writes += 1

    return next(e)
  })
  await $.session.start(START)
  const before = writes

  w.cost = (w.cost ?? 0) + 0.2
  await $.turn.start({ text: 'go', turnId: 't1' })
  await step($)
  await $.classic.PostCompact({ trigger: 'manual' } as never)

  return writes - before
}

test('spendReport off: a turn, a response and a compaction write no state and show nothing', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)

  expect(await quietLedger($, on, w)).toBe(0)
  expect(await paneText($, /^Spend/)).toBeUndefined()
})

test('an unlisted spendReport reads as off', { options: { spendReport: 'everything' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)

  expect(await quietLedger($, on, w)).toBe(0)
  expect(await paneText($, /^Spend/)).toBeUndefined()
})

test('model shows no step line, step does', { options: { spendReport: 'model' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await $.skill.prompt({ skill: 'dev-workflow:workflow-plan', text: 'go' })
  await priced($, w, 0.2)

  expect(await paneText($, /^opus/)).toBeDefined()
  expect(await paneText($, /^plan /)).toBeUndefined()
})

const ticks = async (n: number) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve()
}

test('parallel responses are credited one at a time, so none is counted twice', { options: { spendReport: 'total' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  let release = () => {}
  w.usageGate = new Promise<void>(resolve => {
    release = resolve
  })
  let reads = 0
  let heard = () => {}
  const read = new Promise<void>(resolve => {
    heard = resolve
  })
  w.onUsage = () => {
    reads += 1
    heard()
  }

  // The subagent's read sees $52.14 and stalls; the main loop's response lands meanwhile.
  w.cost = 52.14
  const sub = step($, { agentId: 'a1' })
  await read
  w.cost = 52.24
  const main = step($)
  // Unqueued, the main loop's response would read and finish here; queued, it waits.
  await Promise.race([main, ticks(5000)])
  expect(reads).toBe(1)
  release()
  await Promise.all([sub, main])
  await priced($, w, 0.1)

  expect(await paneText($, /^Spend/)).toBe('Spend $0.30')
})

test('a credit that hangs is dropped after 5 seconds, and the responses behind it go on', { options: { spendReport: 'total' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  const clock = mock.clock(on)
  await $.session.start(START)
  w.usageGate = new Promise<void>(() => {})
  const read = new Promise<void>(resolve => {
    w.onUsage = resolve
  })

  w.cost = 52.14
  const hung = step($)
  await read
  w.onUsage = null
  await clock.advance(5000)
  await hung
  await priced($, w, 0.1)

  // The hung read's $0.10 lands with the next credit instead of being lost.
  expect(await paneText($, /^Spend/)).toBe('Spend $0.20')
})

test('spendReport off sets no timer on a response', async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  // A clock whose timers never fire, counting the ones set.
  let timers = 0
  on('clock.every', () => new Promise<void>(() => {}))
  on('clock.after', () => {
    timers += 1

    return new Promise<void>(() => {})
  })
  await $.session.start(START)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await priced($, w, 0.1)

  expect(timers).toBe(0)
})

test('turning spendReport off drops the ledger at the next event, without a reload', async ($, on) => {
  world(on, { [SCRATCH]: mid })
  mock.clock(on)
  // The ledger kept while the option was on, before this event.
  let stored: unknown = { seen: 52, usd: 0.5, other: 0, models: {}, steps: {}, subagents: { fresh: 0, cached: 0, written: 0, output: 0 } }
  let version = 1
  let writes = 0
  on('state.get', (_$, e, next) => (e.key === 'spend' ? { value: { value: stored, version } } : next(e)))
  // Answered here, so the next read sees the write's version and the update lands.
  on('state.set', (_$, e, next) => {
    if (e.key !== 'spend') return next(e)
    stored = e.value
    version += 1
    writes += 1

    return { value: { isSet: true, version } }
  })

  await $.turn.start({ text: 'go', turnId: 't1' })

  expect(stored).toBeNull()
  expect(writes).toBe(1)
})

test('the pane asks for rows for the spend lines, two for the steps line', { options: { spendReport: 'step' } }, async ($, on) => {
  const w = world(on, { [SCRATCH]: mid })
  mock.clock(on)
  await $.session.start(START)
  await priced($, w, 0.5)

  await $.command.run({ ...PANEL, presentation: { isFullscreen: false, columns: 96 } })

  expect(w.lastOpen).toEqual({ rows: 16, columns: 56 })
})
