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
  }
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
    expect(await ui.find({ type: 'Text', text: /~✅ 1 Add the route/ })).toBeDefined()
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
    for (const step of [/⬜ 1 Add the route/, /⬜ 2 Build the page/, /⬜ 3 Link it from the menu/]) {
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
  expect(await ui.find({ type: 'Text', text: /✅ C1 Crash on empty list/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /🟡 W1 Slow poll/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /🔵 S1 Rename the page/ })).toBeDefined()
})

test('inline, settled findings fold into a count', async ($, on) => {
  world(on, { [SCRATCH]: REVIEWED })
  mock.clock(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('inline', 8), surface })

    expect(await ui.find({ type: 'Text', text: /🟡 W1 Slow poll/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /C1 Crash on empty list/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /✅ 1 resolved/ })).toBeDefined()
    await ui.unmount()
  }
})
