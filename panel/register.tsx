import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { CriterionState, Finding, StepId } from './types'
import { WORKFLOW_STEPS, parseScratchpad } from './parse'
import { CRITERION_ORDER, deriveView } from './view'
import type { Icon, StepRow } from './view'

type Api = Parameters<Hook<'session.start'>>[0]

const PANE = 'workflow'
const SCRATCHPAD = '.workflow/current-issue.md'
const POLL_MS = 3000
const MAX_EDITS = 500
const DOCK_COLUMNS = 56
// Where the terminal docks a pane beside the transcript instead of above the prompt.
const DOCK_MIN_COLUMNS = 110

const snapshot = atom({ plugin: 'dev-workflow', key: 'snapshot' } as const, null)
const issue = atom({ plugin: 'dev-workflow', key: 'issue' } as const, null)
const edits = atom({ plugin: 'dev-workflow', key: 'edits' } as const, [])
const active = atom({ plugin: 'dev-workflow', key: 'active' } as const, null)
const autoOpened = atom({ plugin: 'dev-workflow', key: 'autoOpened' } as const, false)

const STEP_IDS = new Set<string>(WORKFLOW_STEPS.map(d => d.id))

const SEVERITY: Record<string, string> = { C: '🔴', W: '🟡', S: '🔵' }

// The band's step marks, after the workflow-band mod.
const BAND = {
  done: { mark: '✓', color: 'success' },
  failed: { mark: '✗', color: 'error' },
  current: { mark: '▸', color: 'warning' },
  todo: { mark: '·', color: 'inactive' },
} as const

const SHORT: Partial<Record<StepId, string>> = { 'test-red': 'red', 'implement-green': 'green' }

const bandState = (s: StepRow, currentId: StepId | null): keyof typeof BAND =>
  s.icon === '✅' ? 'done' : s.icon === '❌' ? 'failed' : s.id === currentId ? 'current' : 'todo'

const findingIcon = (f: Finding): string =>
  f.state === 'fixed' ? '✅' : f.state === 'declined' ? '➖' : (SEVERITY[f.id.charAt(0)] ?? '•')

// The pane's colors, as theme keys so they follow the person's theme.
const TONE = {
  title: 'permission',
  heading: 'suggestion',
  meta: 'subtle',
  next: 'claude',
  empty: 'subtle',
} as const

const STEP_TONE: Record<Icon, string> = { '✅': 'success', '🔄': 'warning', '⬜': 'inactive', '❌': 'error' }

const CRITERION_TONE: Record<CriterionState, string> = {
  met: 'success',
  failed: 'error',
  partly: 'warning',
  unverified: 'suggestion',
  open: 'inactive',
}

// The breakdown line names each mark, so it doubles as the legend.
const CRITERION_MARK: Record<CriterionState, string> = { met: '✅', failed: '❌', partly: '🌓', unverified: '🔍', open: '⬜' }

// Inline, the room goes to the criteria that are broken or half done.
const isUrgent = (state: CriterionState): boolean => state === 'failed' || state === 'partly'

const SEVERITY_TONE: Record<string, string> = { C: 'error', W: 'warning', S: 'suggestion' }

const findingTone = (f: Finding): string =>
  f.state === 'fixed' ? 'success' : f.state === 'declined' ? 'inactive' : (SEVERITY_TONE[f.id.charAt(0)] ?? 'text')

// Module state: starts over with each reload, like the module's other variables.
let root: string | null = null
let seenMtime = -1

// The nearest ancestor of the session's cwd holding a scratchpad, not
// climbing past the repository root.
const locate = async ($: Api): Promise<string | null> => {
  let dir = await $.session.cwd()
  for (;;) {
    if (await $.fs.exists(`${dir}/${SCRATCHPAD}`)) return dir
    const up = dir.slice(0, dir.lastIndexOf('/')) || '/'
    if (up === dir || (await $.fs.exists(`${dir}/.git`))) return null
    dir = up
  }
}

const refresh = async ($: Api, isForced = false): Promise<void> => {
  root ??= await locate($)
  const path = root && `${root}/${SCRATCHPAD}`
  if (!path || !(await $.fs.exists(path))) {
    root = null
    seenMtime = -1
    // Only the change to "no scratchpad" is news; an idle poll writes nothing.
    if ((await read($, snapshot)) === null) return
    await update($, snapshot, () => null)
    return
  }
  const { mtimeMs } = await $.fs.stat(path)
  if (!isForced && mtimeMs === seenMtime) return
  seenMtime = mtimeMs

  const next = parseScratchpad(await $.fs.read(path))
  // Compared with the last issue seen, not the last snapshot: clarify moves the
  // old scratchpad away before writing the new one, and the poll sees the gap.
  const id = next.key ?? next.title
  const seen = await read($, issue)
  if (seen !== id) {
    if (seen !== null) {
      await update($, edits, () => [])
      await update($, active, () => null)
    }
    await update($, issue, () => id)
  }
  await update($, snapshot, () => next)
}

// Asks for rows enough to list the plan inline, and a sidebar's width when docked.
const openPane = async ($: Api) => {
  const snap = await read($, snapshot)
  const open = snap?.findings.filter(f => f.state === 'open').length ?? 0
  // A snapshot kept from before the five markers is not a list yet.
  const list = snap?.criteria
  const urgent = Array.isArray(list) ? list.filter(c => isUrgent(c.state)).length : 0
  const rows = Math.min(40, 9 + (snap?.plan.length ?? 0) + (open > 0 ? open + 2 : 0) + (urgent > 0 ? urgent + 2 : 0))

  return $.ui.open({ id: PANE, title: 'Workflow', rows, columns: DOCK_COLUMNS })
}

// A failure here only costs the panel; it never reaches the skill or tool.
const guarded = async (run: () => Promise<unknown>): Promise<void> => {
  try {
    await run()
  } catch {
    // keep the last good state
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await guarded(() =>
      $.command.register({
        name: 'workflow-panel',
        description: 'Show or hide the workflow status panel',
      }),
    )
    await guarded(() => refresh($, true))
    $.clock.every(POLL_MS, () => void guarded(() => refresh($)))

    return next(e)
  })

  on('skill.prompt', { skill: /(^|:)workflow-[a-z-]+$/ }, async ($, e, next) => {
    await guarded(async () => {
      const step = (e.skill.split(':').pop() ?? '').replace(/^workflow-/, '')
      if (STEP_IDS.has(step)) {
        await update($, active, () => step as StepId)
      }
      await refresh($, true)
      if (options.autoOpen === true && (await read($, snapshot)) && !(await read($, autoOpened))) {
        await update($, autoOpened, () => true)
        await openPane($)
      }
    })

    return next(e)
  })

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    await guarded(async () => {
      if (e.file_path.endsWith(`/${SCRATCHPAD}`)) {
        return refresh($, true)
      }
      root ??= await locate($)
      // Only edits made between planning and the written build status count.
      const snap = await read($, snapshot)
      const isBuilding = snap !== null && snap.plan.length > 0 && snap.written === null
      if (isBuilding && root && e.file_path.startsWith(`${root}/`)) {
        const rel = e.file_path.slice(root.length + 1)
        await update($, edits, list => (list.includes(rel) ? list : [...list, rel].slice(-MAX_EDITS)))
      }
    })

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.CwdChanged', async ($, e, next) => {
    root = null
    seenMtime = -1
    await guarded(() => refresh($, true))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'workflow-panel' }, async ($, e) => {
    const pane = (await $.ui.panes()).find(p => p.id === PANE)
    // Open but behind another tab: opening again brings it forward.
    if (pane?.isShown) {
      await $.ui.close({ id: PANE })

      return { text: 'Workflow panel closed.' }
    }
    await guarded(() => refresh($, true))
    const opened = await openPane($)
    if (!opened.isPlaced) {
      return { text: `Workflow panel opened but not drawn: ${opened.reason}` }
    }
    const { isFullscreen, columns } = e.presentation

    const fix = !isFullscreen
      ? 'run /tui fullscreen (the classic renderer never docks a pane)'
      : `widen the terminal to ${DOCK_MIN_COLUMNS}+ columns (now ${columns})`

    return {
      text:
        isFullscreen && columns >= DOCK_MIN_COLUMNS
          ? 'Workflow panel opened as a right sidebar.'
          : `Workflow panel opened above the prompt. For a right sidebar, ${fix}.`,
    }
  })

  // Always-on band above the prompt: the issue and its workflow steps.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || !snap) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const view = deriveView(snap, await read($, edits), await read($, active))

    return (
      <Box flexDirection="column">
        <Text weight="bold" color={TONE.title} wrap="truncate">
          {[view.key, view.title].filter(Boolean).join(' · ')}
        </Text>
        <Box gap={1} flexWrap="wrap">
          {view.steps.map(s => {
            const state = bandState(s, view.currentId)
            return (
              <Text key={s.id} color={BAND[state].color} weight={state === 'current' ? 'bold' : 'regular'}>
                {BAND[state].mark}
                {SHORT[s.id] ?? s.id}
                {state === 'current' ? view.progress : ''}
              </Text>
            )
          })}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)

    if (!snap) {
      return <Text color={TONE.empty}>No active workflow — start with /workflow-clarify</Text>
    }

    const view = deriveView(snap, await read($, edits), await read($, active))
    // The band carries the workflow steps; the pane is the detail. Every plan
    // step is listed (the pane scrolls), briefs only when they fit.
    const isDocked = e.props.placement === 'dock'
    // Inline, settled findings fold into a count so the open ones keep the room.
    const openFindings = view.findings.filter(f => f.state === 'open')
    const listed = isDocked ? view.findings : openFindings
    const settled = view.findings.length - listed.length
    const { criteria } = view
    const met = criteria.counts.met
    const unmet = criteria.total - met
    const pending = isDocked ? criteria.pending : criteria.pending.filter(c => isUrgent(c.state))
    // Each list below the plan costs a blank line and a heading too.
    const lists =
      (view.findings.length > 0 ? listed.length + 2 + (settled > 0 ? 1 : 0) : 0) +
      (pending.length > 0 ? pending.length + 2 : 0)
    const fixed = 8
    const hasBrief = fixed + view.plan.length * 2 + lists <= e.props.scroll.bodyRows
    const subtitle = [view.mode === 'tdd' ? 'TDD' : view.mode === 'regular' ? 'Regular' : null, view.branch]
      .filter(Boolean)
      .join(' · ')

    return (
      <Box flexDirection="column">
        <Text weight="bold" color={TONE.title} wrap="truncate">
          {view.key ? `${view.key} · ` : ''}
          {view.title}
        </Text>
        {subtitle !== '' && (
          <Text color={TONE.meta} wrap="truncate">
            {subtitle}
          </Text>
        )}
        {criteria.total > 0 && (
          <Box gap={1} flexWrap="wrap">
            <Text color={met === criteria.total ? 'success' : 'warning'}>
              Criteria {met}/{criteria.total}
            </Text>
            {CRITERION_ORDER.filter(state => criteria.counts[state] > 0).map(state => (
              <Text key={state} color={CRITERION_TONE[state]}>
                · {CRITERION_MARK[state]} {criteria.counts[state]} {state}
              </Text>
            ))}
          </Box>
        )}
        {view.plan.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text weight="bold" color={TONE.heading}>
              Plan ({view.plan.length} {view.planNoun})
            </Text>
            {view.plan.map(r => (
              <Box key={String(r.n)} flexDirection="column">
                <Box flexDirection="row">
                  <Text color={STEP_TONE[r.icon]}>
                    {r.inferred ? '~' : ''}
                    {r.icon} {r.n}
                    {' '}
                  </Text>
                  <Text dimColor={r.inferred} wrap="truncate">
                    {r.title}
                  </Text>
                </Box>
                {hasBrief && r.brief !== '' && (
                  <Text color={TONE.meta} dimColor wrap="truncate">
                    {'    '}
                    {r.brief}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
        {view.findings.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text weight="bold" color={TONE.heading}>
              Review ({openFindings.length} open of {view.findings.length})
            </Text>
            {listed.map(f => (
              <Box key={f.id} flexDirection="row">
                <Text color={findingTone(f)}>
                  {findingIcon(f)} {f.id}
                  {' '}
                </Text>
                <Text wrap="truncate">{f.title}</Text>
              </Box>
            ))}
            {settled > 0 && <Text color="success">✅ {settled} resolved</Text>}
          </Box>
        )}
        {pending.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text weight="bold" color={TONE.heading}>
              Criteria ({pending.length < unmet ? `${pending.length} of ${unmet}` : unmet} not met)
            </Text>
            {pending.map((c, i) => (
              <Box key={String(i)} flexDirection="row">
                <Text color={CRITERION_TONE[c.state]}>{CRITERION_MARK[c.state]} </Text>
                <Text wrap="truncate">{c.text}</Text>
              </Box>
            ))}
          </Box>
        )}
        {view.next !== null && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text color={TONE.next} wrap="truncate">
              ➡ Next: {view.next}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
